import { Effect } from "effect";

import type {
  Config,
  EpisodeSearchResult,
  SearchResults,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import type { AniListClient } from "../anime/anilist.ts";
import { EventBus } from "../events/event-bus.ts";
import { type ParsedRelease, RssClient } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";
import { applySeaDexMatch } from "./seadex-matching.ts";
import { makeBackgroundSearchSupport } from "./background-search-support.ts";
import {
  loadCurrentEpisodeState,
  loadQualityProfile,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import { mapSearchCategory, mapSearchFilter, toNyaaSearchResult } from "./search-support.ts";
import { scanImportPathEffect } from "./import-path-scan-support.ts";
import {
  compareEpisodeSearchResults,
  decideDownloadAction,
  parseReleaseName,
} from "./release-ranking.ts";
import { parseReleaseSourceIdentity } from "../../lib/media-identity.ts";
import { compactLogAnnotations, errorLogAnnotations } from "../../lib/logging.ts";
import {
  ExternalCallError,
  type OperationsError,
  OperationsInputError,
  OperationsPathError,
} from "./errors.ts";
import type { TryDatabasePromise } from "./service-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { makeUnmappedOrchestrationSupport } from "./unmapped-orchestration-support.ts";
import type { OperationsCoordinationShape } from "./runtime-support.ts";

export function makeSearchOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  aniList: typeof AniListClient.Service;
  rssClient: typeof RssClient.Service;
  seadexClient: typeof SeaDexClient.Service;
  qbitClient: typeof QBitTorrentClient.Service;
  eventBus: typeof EventBus.Service;
  tryDatabasePromise: TryDatabasePromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
  nowIso: () => Effect.Effect<string>;
  publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
  publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
  coordination: OperationsCoordinationShape;
}) {
  const {
    db,
    fs,
    mediaProbe,
    aniList,
    rssClient,
    seadexClient,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    wrapOperationsError,
    dbError,
    maybeQBitConfig,
    publishDownloadProgress,
    publishRssCheckProgress,
    coordination,
  } = input;
  const nowIso = input.nowIso;

  const searchNyaaReleases = Effect.fn("OperationsService.searchNyaaReleases")(function* (
    query: string,
    config: Config,
    category?: string,
    filter?: string,
  ) {
    const resolvedCategory = mapSearchCategory(category, config.nyaa.default_category || "1_2");
    const resolvedFilter = mapSearchFilter(filter, config.nyaa.filter_remakes ? "1" : "0");
    const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=${encodeURIComponent(
      resolvedCategory,
    )}&f=${encodeURIComponent(resolvedFilter)}`;
    return [...(yield* rssClient.fetchItems(url))];
  });

  const searchEpisodeReleases = Effect.fn("OperationsService.searchEpisodeReleases")(function* (
    animeRow: typeof anime.$inferSelect,
    episodeNumber: number,
    config: Config,
  ) {
    const queries = [
      `${animeRow.titleRomaji} ${String(episodeNumber).padStart(2, "0")}`,
      `${animeRow.titleRomaji} ${episodeNumber}`,
      animeRow.titleEnglish
        ? `${animeRow.titleEnglish} ${String(episodeNumber).padStart(2, "0")}`
        : null,
    ].filter((value): value is string => Boolean(value));

    const results: ParsedRelease[] = [];

    for (const query of queries) {
      const items = yield* searchNyaaReleases(query, config);

      for (const item of items) {
        const parsedRelease = parseReleaseName(item.title);

        if (
          parsedRelease.episodeNumbers.length > 0 &&
          !parsedRelease.episodeNumbers.includes(episodeNumber) &&
          !parsedRelease.isBatch
        ) {
          continue;
        }

        if (!results.some((existing) => existing.infoHash === item.infoHash)) {
          results.push(item);
        }
      }

      if (results.length >= 10) {
        break;
      }
    }

    return yield* enrichSeaDexReleases(animeRow, results.slice(0, 10), config);
  });

  const enrichSeaDexReleases = Effect.fn("OperationsService.enrichSeaDexReleases")(function* (
    animeRow: typeof anime.$inferSelect,
    releases: readonly ParsedRelease[],
    config: Config,
  ) {
    if (!config.downloads.use_seadex || releases.length === 0) {
      return [...releases];
    }

    const entry = yield* seadexClient.getEntryByAniListId(animeRow.id).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("SeaDex enrichment failed").pipe(
          Effect.annotateLogs(
            compactLogAnnotations({
              animeId: animeRow.id,
              animeTitle: animeRow.titleRomaji,
              component: "operations",
              event: "operations.seadex.enrichment.failed",
              ...errorLogAnnotations(error),
            }),
          ),
        ),
      ),
    );

    if (!entry || entry.releases.length === 0) {
      return [...releases];
    }

    return releases.map((release) => applySeaDexMatch(release, entry));
  });

  const searchReleasesRaw = Effect.fn("OperationsService.searchReleases")(function* (
    query: string,
    animeId?: number,
    category?: string,
    filter?: string,
  ) {
    const animeRow = animeId ? yield* requireAnime(db, animeId) : null;
    const searchQuery = (query || animeRow?.titleRomaji || "").trim();

    if (searchQuery.length === 0) {
      return yield* new OperationsInputError({
        message: "Search query is required",
      });
    }

    const runtimeConfig = yield* loadRuntimeConfig(db);
    const results = yield* searchNyaaReleases(searchQuery, runtimeConfig, category, filter).pipe(
      Effect.mapError(wrapOperationsError("Failed to search releases")),
    );

    const enrichedResults = animeRow
      ? yield* enrichSeaDexReleases(animeRow, results, runtimeConfig).pipe(
          Effect.mapError(wrapOperationsError("Failed to search releases")),
        )
      : results;

    return {
      results: enrichedResults.map(toNyaaSearchResult),
      seadex_groups: [
        ...new Set(
          enrichedResults
            .filter((item) => item.isSeaDex)
            .map((item) => item.seaDexReleaseGroup ?? item.group)
            .filter((value): value is string => Boolean(value)),
        ),
      ],
    } satisfies SearchResults;
  });

  const searchReleases = (query: string, animeId?: number, category?: string, filter?: string) =>
    searchReleasesRaw(query, animeId, category, filter).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError ||
        error instanceof ExternalCallError ||
        error instanceof OperationsInputError
          ? error
          : dbError("Failed to search releases")(error),
      ),
    );

  const searchEpisode = Effect.fn("OperationsService.searchEpisode")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    const animeRow = yield* requireAnime(db, animeId);
    const runtimeConfig = yield* loadRuntimeConfig(db);
    const profile = yield* loadQualityProfile(db, animeRow.profileName);

    if (!profile) {
      return yield* new OperationsInputError({
        message: `Quality profile '${animeRow.profileName}' not found`,
      });
    }

    const rules = yield* loadReleaseRules(db, animeRow);
    const currentEpisode = yield* loadCurrentEpisodeState(db, animeId, episodeNumber);
    const results = yield* searchEpisodeReleases(animeRow, episodeNumber, runtimeConfig).pipe(
      Effect.mapError(wrapOperationsError("Failed to search episode releases")),
    );

    return results
      .map((item) => {
        const parsedIdentity = parseReleaseSourceIdentity(item.title).source_identity;

        return {
          download_action: decideDownloadAction(
            profile,
            rules,
            currentEpisode,
            item,
            runtimeConfig,
          ),
          group: item.group,
          indexer: "Nyaa",
          info_hash: item.infoHash,
          is_seadex: item.isSeaDex || undefined,
          is_seadex_best: item.isSeaDexBest || undefined,
          leechers: item.leechers,
          link: item.magnet,
          parsed_air_date:
            parsedIdentity?.scheme === "daily" ? parsedIdentity.air_dates[0] : undefined,
          parsed_episode_label: parsedIdentity?.label,
          parsed_episode_numbers:
            parsedIdentity && parsedIdentity.scheme !== "daily"
              ? [...parsedIdentity.episode_numbers]
              : undefined,
          parsed_resolution: item.resolution,
          publish_date: item.pubDate,
          quality: parseReleaseName(item.title).quality.name,
          remake: item.remake,
          seadex_comparison: item.seaDexComparison,
          seadex_dual_audio: item.seaDexDualAudio,
          seadex_notes: item.seaDexNotes,
          seadex_release_group: item.seaDexReleaseGroup,
          seadex_tags: item.seaDexTags ? [...item.seaDexTags] : undefined,
          seeders: item.seeders,
          size: item.sizeBytes,
          title: item.title,
          trusted: item.trusted,
          view_url: item.viewUrl,
        };
      })
      .sort(compareEpisodeSearchResults) as EpisodeSearchResult[];
  });
  const backgroundSearchSupport = makeBackgroundSearchSupport({
    db,
    dbError,
    eventBus,
    maybeQBitConfig,
    nowIso,
    publishDownloadProgress,
    publishRssCheckProgress,
    qbitClient,
    rssClient,
    searchEpisodeReleases,
    coordination,
    tryDatabasePromise,
    wrapOperationsError,
  });

  const { runRssCheck, triggerSearchMissing } = backgroundSearchSupport;
  const unmappedOrchestrationSupport = makeUnmappedOrchestrationSupport({
    aniList,
    db,
    dbError,
    fs,
    nowIso,
    tryDatabasePromise,
    coordination,
  });

  const {
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
    getUnmappedFolders,
    importUnmappedFolder,
    runUnmappedScan,
  } = unmappedOrchestrationSupport;
  const scanImportPathRaw = (path: string, animeId?: number) =>
    scanImportPathEffect({
      aniList,
      animeId,
      db,
      fs,
      mediaProbe,
      path,
      tryDatabasePromise,
    });

  const scanImportPath = (path: string, animeId?: number) =>
    scanImportPathRaw(path, animeId).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError || error instanceof OperationsPathError
          ? error
          : dbError("Failed to scan import path")(error),
      ),
    );

  return {
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
    getUnmappedFolders,
    importUnmappedFolder,
    runRssCheck,
    runUnmappedScan,
    scanImportPath,
    searchEpisode,
    searchEpisodeReleases,
    searchNyaaReleases,
    searchReleases,
    triggerSearchMissing,
  };
}
