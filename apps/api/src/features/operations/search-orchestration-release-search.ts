import { Context, Effect, Either, Layer, Option, Schema } from "effect";

import type { Config, SearchResults } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/infra/logging.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { SeaDexClient } from "@/features/operations/seadex-client.ts";
import { applySeaDexMatch } from "@/features/operations/seadex-matching.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/anime/anime-read-repository.ts";
import {
  mapSearchCategory,
  mapSearchFilter,
  toNyaaSearchResult,
} from "@/features/operations/search-support.ts";
import { parseReleaseName } from "@/features/operations/release-ranking.ts";
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

const AnimeSynonymsJsonSchema = Schema.parseJson(Schema.Array(Schema.String));

export interface SearchReleaseServiceShape {
  readonly enrichSeaDexReleases: (
    animeRow: typeof anime.$inferSelect,
    releases: readonly ParsedRelease[],
    config: Config,
  ) => Effect.Effect<ParsedRelease[], ExternalCallError>;
  readonly searchEpisodeReleases: (
    animeRow: typeof anime.$inferSelect,
    episodeNumber: number,
    config: Config,
  ) => Effect.Effect<ParsedRelease[], SearchReleaseSourceError>;
  readonly searchNyaaReleases: SearchNyaaReleases;
  readonly searchReleases: (
    query: string,
    animeId?: number,
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
    animeRow: typeof anime.$inferSelect,
    releases: readonly ParsedRelease[],
  ) {
    if (releases.length === 0) {
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

    if (Option.isNone(entry) || entry.value.releases.length === 0) {
      return [...releases];
    }

    return releases.map((release) => applySeaDexMatch(release, entry.value));
  });

  const searchEpisodeReleases = Effect.fn("OperationsService.searchEpisodeReleases")(function* (
    animeRow: typeof anime.$inferSelect,
    episodeNumber: number,
    config: Config,
  ) {
    yield* Effect.annotateCurrentSpan("animeId", animeRow.id);
    yield* Effect.annotateCurrentSpan("episodeNumber", episodeNumber);

    const results = yield* collectEpisodeSearchReleases(
      animeRow,
      episodeNumber,
      config,
      searchNyaaReleases,
    );

    const enriched = yield* enrichSeaDexReleases(animeRow, results.slice(0, 10));
    yield* Effect.annotateCurrentSpan("resultCount", enriched.length);
    return enriched;
  });

  const searchReleasesInternal = Effect.fn("OperationsService.searchReleasesInternal")(function* (
    query: string,
    animeId?: number,
    category?: string,
    filter?: string,
  ) {
    if (animeId !== undefined) {
      yield* Effect.annotateCurrentSpan("animeId", animeId);
    }

    const animeRow = animeId ? yield* requireAnime(db, animeId) : null;
    const searchQuery = (query || animeRow?.titleRomaji || "").trim();

    if (searchQuery.length === 0) {
      return yield* new OperationsInputError({
        message: "Search query is required",
      });
    }

    const runtimeConfig = yield* getRuntimeConfig();
    const results = yield* searchNyaaReleases(searchQuery, runtimeConfig, category, filter).pipe(
      Effect.mapError(mapSearchReleaseError),
    );

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
    animeId?: number,
    category?: string,
    filter?: string,
  ) {
    return yield* searchReleasesInternal(query, animeId, category, filter);
  });

  return {
    enrichSeaDexReleases,
    searchEpisodeReleases,
    searchNyaaReleases,
    searchReleases,
  } satisfies SearchReleaseServiceShape;
}

function buildNyaaSearchUrl(query: string, category: string, filter: string) {
  return `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=${encodeURIComponent(
    category,
  )}&f=${encodeURIComponent(filter)}`;
}

function buildEpisodeSearchQueries(animeRow: typeof anime.$inferSelect, episodeNumber: number) {
  const paddedEpisode = String(episodeNumber).padStart(2, "0");
  const seasonEpisode = `S01E${paddedEpisode}`;
  const aliases = buildAnimeSearchAliases(animeRow);

  return uniqueStrings(
    aliases.flatMap((alias) => [
      `${alias} ${paddedEpisode}`,
      `${alias} ${episodeNumber}`,
      `${alias} ${seasonEpisode}`,
    ]),
  );
}

function buildBroadSearchQueries(animeRow: typeof anime.$inferSelect) {
  return buildAnimeSearchAliases(animeRow);
}

function buildAnimeSearchAliases(animeRow: typeof anime.$inferSelect) {
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
  episodeNumber: number,
  seenInfoHashes: ReadonlySet<string>,
) {
  const parsedRelease = parseReleaseName(item.title);

  if (
    parsedRelease.episodeNumbers.length > 0 &&
    !parsedRelease.episodeNumbers.includes(episodeNumber) &&
    !parsedRelease.isBatch
  ) {
    return "episode_mismatch" as const;
  }

  if (seenInfoHashes.has(item.infoHash)) {
    return "duplicate_info_hash" as const;
  }

  return null;
}

function collectEpisodeSearchReleases(
  animeRow: typeof anime.$inferSelect,
  episodeNumber: number,
  config: Config,
  searchNyaaReleases: SearchNyaaReleases,
): Effect.Effect<ParsedRelease[], SearchReleaseSourceError> {
  const seenInfoHashes = new Set<string>();
  const keepEpisodeRelease = (
    item: ParsedRelease,
    query: string,
    phase: "episode" | "fallback",
  ) => {
    const rejectionReason = getEpisodeReleaseRejectionReason(item, episodeNumber, seenInfoHashes);

    if (rejectionReason !== null) {
      return Effect.logDebug("Rejected episode search release").pipe(
        Effect.annotateLogs({
          animeId: animeRow.id,
          episodeNumber,
          event: "operations.search.episode.release.rejected",
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
  const collectQueries = (queries: readonly string[], phase: "episode" | "fallback") =>
    Effect.forEach(
      queries,
      (query) =>
        seenInfoHashes.size >= 10
          ? Effect.succeed([] as readonly ParsedRelease[])
          : searchNyaaReleases(query, config).pipe(
              Effect.tap((items) =>
                Effect.logDebug("Episode search query completed").pipe(
                  Effect.annotateLogs({
                    animeId: animeRow.id,
                    episodeNumber,
                    event: "operations.search.episode.query.completed",
                    phase,
                    query,
                    resultCount: items.length,
                  }),
                ),
              ),
              Effect.flatMap((items) =>
                Effect.filter(items, (item) => keepEpisodeRelease(item, query, phase)),
              ),
            ),
      { concurrency: 1 },
    ).pipe(Effect.map((groups) => groups.flat().slice(0, 10)));

  return Effect.gen(function* () {
    const episodeResults = yield* collectQueries(
      buildEpisodeSearchQueries(animeRow, episodeNumber),
      "episode",
    );

    if (episodeResults.length > 0 || seenInfoHashes.size >= 10) {
      return episodeResults;
    }

    return yield* collectQueries(buildBroadSearchQueries(animeRow), "fallback");
  });
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
