import { Context, Effect, Either, Layer, Option, Schema } from "effect";

import type { Config, SearchResults } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/infra/logging.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { RssClient } from "@/features/operations/rss/rss-client.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { SeaDexClient } from "@/features/operations/search/seadex-client.ts";
import { applySeaDexMatch } from "@/features/operations/search/seadex-matching.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/media/shared/media-read-repository.ts";
import {
  mapSearchCategory,
  mapSearchCategoryForMediaKind,
  mapSearchFilter,
  toNyaaSearchResult,
} from "@/features/operations/search/search-support.ts";
import { parseReleaseName } from "@/features/operations/search/release-ranking.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";
import {
  isOperationsError,
  OperationsInputError,
  OperationsInfrastructureError,
  type OperationsError,
} from "@/features/operations/errors.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

type SearchReleaseError = ExternalCallError | OperationsError | DatabaseError;
type SearchReleaseSourceError =
  | ExternalCallError
  | RssFeedParseError
  | RssFeedRejectedError
  | RssFeedTooLargeError;
type SearchNyaaReleases = (
  query: string,
  config: Config,
  category?: string,
  filter?: string,
) => Effect.Effect<readonly ParsedRelease[], SearchReleaseSourceError>;
type UnitSearchCategory = string | undefined;

const AnimeSynonymsJsonSchema = Schema.parseJson(Schema.Array(Schema.String));

export interface SearchReleaseServiceShape {
  readonly enrichSeaDexReleases: (
    animeRow: typeof media.$inferSelect,
    releases: readonly ParsedRelease[],
    config: Config,
  ) => Effect.Effect<ParsedRelease[], ExternalCallError>;
  readonly searchUnitReleases: (
    animeRow: typeof media.$inferSelect,
    unitNumber: number,
    config: Config,
  ) => Effect.Effect<ParsedRelease[], SearchReleaseSourceError>;
  readonly searchNyaaReleases: SearchNyaaReleases;
  readonly searchReleases: (
    query: string,
    mediaId?: number,
    category?: string,
    filter?: string,
  ) => Effect.Effect<SearchResults, OperationsError | DatabaseError | RuntimeConfigSnapshotError>;
}

export function makeSearchReleaseSupport(input: {
  db: AppDatabase;
  getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
  rssClient: typeof RssClient.Service;
  seadexClient: typeof SeaDexClient.Service;
}) {
  const { db, getRuntimeConfig, rssClient, seadexClient } = input;

  const mapSearchReleaseError = (cause: unknown): SearchReleaseError =>
    cause instanceof DatabaseError || cause instanceof ExternalCallError || isOperationsError(cause)
      ? cause
      : new OperationsInfrastructureError({
          message: "Failed to search releases",
          cause,
        });

  const searchNyaaReleases = Effect.fn("OperationsService.searchNyaaReleases")(function* (
    query: string,
    config: Config,
    category?: string,
    filter?: string,
  ) {
    const resolvedCategory = mapSearchCategory(category, config.nyaa.default_category || "1_2");
    const resolvedFilter = mapSearchFilter(filter, config.nyaa.filter_remakes ? "1" : "0");
    yield* Effect.annotateCurrentSpan("queryLength", query.length);
    yield* Effect.annotateCurrentSpan("category", resolvedCategory);
    yield* Effect.annotateCurrentSpan("filter", resolvedFilter);
    const url = buildNyaaSearchUrl(query, resolvedCategory, resolvedFilter);
    return [...(yield* rssClient.fetchItems(url))];
  });

  const enrichSeaDexReleases = Effect.fn("OperationsService.enrichSeaDexReleases")(function* (
    animeRow: typeof media.$inferSelect,
    releases: readonly ParsedRelease[],
  ) {
    if (releases.length === 0) {
      return [...releases];
    }

    if (animeRow.mediaKind !== "anime") {
      return [...releases];
    }

    const entry = yield* seadexClient.getEntryByAniListId(animeRow.id).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("SeaDex enrichment failed").pipe(
          Effect.annotateLogs(
            compactLogAnnotations({
              mediaId: animeRow.id,
              mediaTitle: animeRow.titleRomaji,
              component: "operations",
              event: "operations.seadex.enrichment.failed",
              ...errorLogAnnotations(error),
            }),
          ),
        ),
      ),
    );

    if (Option.isNone(entry) || entry.value.releases.length === 0) {
      return [...releases];
    }

    return releases.map((release) => applySeaDexMatch(release, entry.value));
  });

  const searchUnitReleases = Effect.fn("OperationsService.searchUnitReleases")(function* (
    animeRow: typeof media.$inferSelect,
    unitNumber: number,
    config: Config,
  ) {
    yield* Effect.annotateCurrentSpan("mediaId", animeRow.id);
    yield* Effect.annotateCurrentSpan("unitNumber", unitNumber);

    const results = yield* collectUnitSearchReleases(
      animeRow,
      unitNumber,
      config,
      searchNyaaReleases,
    );

    const enriched = yield* enrichSeaDexReleases(animeRow, results.slice(0, 10));
    yield* Effect.annotateCurrentSpan("resultCount", enriched.length);
    return enriched;
  });

  const searchReleasesInternal = Effect.fn("OperationsService.searchReleasesInternal")(function* (
    query: string,
    mediaId?: number,
    category?: string,
    filter?: string,
  ) {
    if (mediaId !== undefined) {
      yield* Effect.annotateCurrentSpan("mediaId", mediaId);
    }

    const animeRow = mediaId ? yield* requireAnime(db, mediaId) : null;
    const searchQuery = (query || animeRow?.titleRomaji || "").trim();

    if (searchQuery.length === 0) {
      return yield* new OperationsInputError({
        message: "Search query is required",
      });
    }

    const runtimeConfig = yield* getRuntimeConfig();
    const results = yield* searchNyaaReleases(
      searchQuery,
      runtimeConfig,
      resolveSearchCategoryForMediaKind(category, runtimeConfig, animeRow?.mediaKind),
      filter,
    ).pipe(Effect.mapError(mapSearchReleaseError));

    const enrichedResults = animeRow
      ? yield* enrichSeaDexReleases(animeRow, results).pipe(Effect.mapError(mapSearchReleaseError))
      : results;

    yield* Effect.annotateCurrentSpan("resultCount", enrichedResults.length);

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

  const searchReleases = Effect.fn("OperationsService.searchReleases")(function* (
    query: string,
    mediaId?: number,
    category?: string,
    filter?: string,
  ) {
    return yield* searchReleasesInternal(query, mediaId, category, filter);
  });

  return {
    enrichSeaDexReleases,
    searchUnitReleases,
    searchNyaaReleases,
    searchReleases,
  } satisfies SearchReleaseServiceShape;
}

function buildNyaaSearchUrl(query: string, category: string, filter: string) {
  return `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=${encodeURIComponent(
    category,
  )}&f=${encodeURIComponent(filter)}`;
}

function buildEpisodeSearchQueries(animeRow: typeof media.$inferSelect, unitNumber: number) {
  const paddedEpisode = String(unitNumber).padStart(2, "0");
  const seasonEpisode = `S01E${paddedEpisode}`;
  const aliases = buildAnimeSearchAliases(animeRow);

  return uniqueStrings(
    aliases.flatMap((alias) => [
      `${alias} ${paddedEpisode}`,
      `${alias} ${unitNumber}`,
      `${alias} ${seasonEpisode}`,
    ]),
  );
}

function buildVolumeSearchQueries(animeRow: typeof media.$inferSelect, volumeNumber: number) {
  const paddedVolume = String(volumeNumber).padStart(2, "0");
  const aliases = buildAnimeSearchAliases(animeRow);

  return uniqueStrings(
    aliases.flatMap((alias) => [
      `${alias} Vol ${volumeNumber}`,
      `${alias} Vol ${paddedVolume}`,
      `${alias} Volume ${volumeNumber}`,
      `${alias} v${volumeNumber}`,
    ]),
  );
}

function buildBroadSearchQueries(animeRow: typeof media.$inferSelect) {
  return buildAnimeSearchAliases(animeRow);
}

function buildAnimeSearchAliases(animeRow: typeof media.$inferSelect) {
  const aliases = [
    animeRow.titleRomaji,
    animeRow.titleEnglish,
    ...decodeAnimeSynonyms(animeRow.synonyms),
  ];

  return uniqueStrings(
    aliases.flatMap((alias) => {
      if (!alias) {
        return [];
      }

      const normalized = normalizeSearchAlias(alias);
      return normalized === alias ? [alias] : [alias, normalized];
    }),
  );
}

function decodeAnimeSynonyms(value: string | null) {
  if (!value) {
    return [];
  }

  const result = Schema.decodeUnknownEither(AnimeSynonymsJsonSchema)(value);
  return Either.isRight(result) ? result.right.filter((entry) => entry.trim().length > 0) : [];
}

function normalizeSearchAlias(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function uniqueStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase();

    if (trimmed.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

function getEpisodeReleaseRejectionReason(
  item: ParsedRelease,
  unitNumber: number,
  seenInfoHashes: ReadonlySet<string>,
) {
  const parsedRelease = parseReleaseName(item.title);

  if (
    parsedRelease.unitNumbers.length > 0 &&
    !parsedRelease.unitNumbers.includes(unitNumber) &&
    !parsedRelease.isBatch
  ) {
    return "episode_mismatch" as const;
  }

  if (seenInfoHashes.has(item.infoHash)) {
    return "duplicate_info_hash" as const;
  }

  return null;
}

function getVolumeReleaseRejectionReason(
  item: ParsedRelease,
  volumeNumber: number,
  seenInfoHashes: ReadonlySet<string>,
) {
  const volumes = parseVolumeNumbersFromTitle(item.title);

  if (volumes.length > 0 && !volumes.includes(volumeNumber)) {
    return "volume_mismatch" as const;
  }

  if (seenInfoHashes.has(item.infoHash)) {
    return "duplicate_info_hash" as const;
  }

  return null;
}

function collectUnitSearchReleases(
  animeRow: typeof media.$inferSelect,
  unitNumber: number,
  config: Config,
  searchNyaaReleases: SearchNyaaReleases,
): Effect.Effect<ParsedRelease[], SearchReleaseSourceError> {
  const seenInfoHashes = new Set<string>();
  const mediaKind = animeRow.mediaKind;
  const category = resolveSearchCategoryForMediaKind(undefined, config, mediaKind);
  const keepUnitRelease = (item: ParsedRelease, query: string, phase: "unit" | "fallback") => {
    const rejectionReason =
      mediaKind === "anime"
        ? getEpisodeReleaseRejectionReason(item, unitNumber, seenInfoHashes)
        : getVolumeReleaseRejectionReason(item, unitNumber, seenInfoHashes);

    if (rejectionReason !== null) {
      return Effect.logDebug("Rejected unit search release").pipe(
        Effect.annotateLogs({
          mediaId: animeRow.id,
          unitNumber,
          event: "operations.search.unit.release.rejected",
          infoHash: item.infoHash,
          phase,
          query,
          reason: rejectionReason,
          title: item.title,
        }),
        Effect.as(false),
      );
    }

    seenInfoHashes.add(item.infoHash);
    return Effect.succeed(true);
  };
  const collectQueries = (queries: readonly string[], phase: "unit" | "fallback") =>
    Effect.forEach(
      queries,
      (query) =>
        seenInfoHashes.size >= 10
          ? Effect.succeed([] as readonly ParsedRelease[])
          : searchNyaaReleases(query, config, category).pipe(
              Effect.tap((items) =>
                Effect.logDebug("MediaUnit search query completed").pipe(
                  Effect.annotateLogs({
                    mediaId: animeRow.id,
                    unitNumber,
                    event: "operations.search.unit.query.completed",
                    phase,
                    query,
                    resultCount: items.length,
                  }),
                ),
              ),
              Effect.flatMap((items) =>
                Effect.filter(items, (item) => keepUnitRelease(item, query, phase)),
              ),
            ),
      { concurrency: 1 },
    ).pipe(Effect.map((groups) => groups.flat().slice(0, 10)));

  return Effect.gen(function* () {
    const unitResults = yield* collectQueries(
      mediaKind === "anime"
        ? buildEpisodeSearchQueries(animeRow, unitNumber)
        : buildVolumeSearchQueries(animeRow, unitNumber),
      "unit",
    );

    if (unitResults.length > 0 || seenInfoHashes.size >= 10) {
      return unitResults;
    }

    return yield* collectQueries(buildBroadSearchQueries(animeRow), "fallback");
  });
}

function resolveSearchCategoryForMediaKind(
  category: string | undefined,
  config: Config,
  mediaKind: string | undefined,
): UnitSearchCategory {
  if (mediaKind === undefined) {
    return category;
  }

  return mapSearchCategoryForMediaKind(category, config.nyaa.default_category || "1_2", mediaKind);
}

export class SearchReleaseService extends Context.Tag("@bakarr/api/SearchReleaseService")<
  SearchReleaseService,
  SearchReleaseServiceShape
>() {}

export const SearchReleaseServiceLive = Layer.effect(
  SearchReleaseService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const rssClient = yield* RssClient;
    const seadexClient = yield* SeaDexClient;
    const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;

    return makeSearchReleaseSupport({
      db,
      getRuntimeConfig: runtimeConfigSnapshotService.getRuntimeConfig,
      rssClient,
      seadexClient,
    });
  }),
);
