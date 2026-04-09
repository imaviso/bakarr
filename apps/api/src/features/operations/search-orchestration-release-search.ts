import { Context, Effect, Layer, Option } from "effect";

import type { Config, SearchResults } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/lib/logging.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { SeaDexClient } from "@/features/operations/seadex-client.ts";
import { applySeaDexMatch } from "@/features/operations/seadex-matching.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import {
  mapSearchCategory,
  mapSearchFilter,
  toNyaaSearchResult,
} from "@/features/operations/search-support.ts";
import { parseReleaseName } from "@/features/operations/release-ranking.ts";
import {
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
  readonly searchReleasesBase: (
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
    cause instanceof DatabaseError ||
    cause instanceof ExternalCallError ||
    cause instanceof OperationsInputError
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

    const enriched = yield* enrichSeaDexReleases(animeRow, results.slice(0, 10), config);
    yield* Effect.annotateCurrentSpan("resultCount", enriched.length);
    return enriched;
  });

  const searchReleasesBase = Effect.fn("OperationsService.searchReleasesBase")(function* (
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
      ? yield* enrichSeaDexReleases(animeRow, results, runtimeConfig).pipe(
          Effect.mapError(mapSearchReleaseError),
        )
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
    return yield* searchReleasesBase(query, animeId, category, filter).pipe(
      Effect.mapError(mapSearchReleaseError),
    );
  });

  return {
    enrichSeaDexReleases,
    searchEpisodeReleases,
    searchNyaaReleases,
    searchReleases,
    searchReleasesBase,
  } satisfies SearchReleaseServiceShape;
}

function buildNyaaSearchUrl(query: string, category: string, filter: string) {
  return `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=${encodeURIComponent(
    category,
  )}&f=${encodeURIComponent(filter)}`;
}

function buildEpisodeSearchQueries(animeRow: typeof anime.$inferSelect, episodeNumber: number) {
  return [
    `${animeRow.titleRomaji} ${String(episodeNumber).padStart(2, "0")}`,
    `${animeRow.titleRomaji} ${episodeNumber}`,
    animeRow.titleEnglish
      ? `${animeRow.titleEnglish} ${String(episodeNumber).padStart(2, "0")}`
      : null,
  ].filter((value): value is string => Boolean(value));
}

function shouldKeepEpisodeRelease(item: ParsedRelease, episodeNumber: number) {
  const parsedRelease = parseReleaseName(item.title);

  return !(
    parsedRelease.episodeNumbers.length > 0 &&
    !parsedRelease.episodeNumbers.includes(episodeNumber) &&
    !parsedRelease.isBatch
  );
}

function collectEpisodeSearchReleases(
  animeRow: typeof anime.$inferSelect,
  episodeNumber: number,
  config: Config,
  searchNyaaReleases: SearchNyaaReleases,
): Effect.Effect<ParsedRelease[], SearchReleaseSourceError> {
  const seenInfoHashes = new Set<string>();

  return Effect.forEach(
    buildEpisodeSearchQueries(animeRow, episodeNumber),
    (query) =>
      seenInfoHashes.size >= 10
        ? Effect.succeed([] as readonly ParsedRelease[])
        : searchNyaaReleases(query, config).pipe(
            Effect.map((items) =>
              items.filter((item) => {
                if (seenInfoHashes.size >= 10 || !shouldKeepEpisodeRelease(item, episodeNumber)) {
                  return false;
                }

                if (seenInfoHashes.has(item.infoHash)) {
                  return false;
                }

                seenInfoHashes.add(item.infoHash);
                return true;
              }),
            ),
          ),
    { concurrency: 1 },
  ).pipe(Effect.map((groups) => groups.flat().slice(0, 10)));
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
