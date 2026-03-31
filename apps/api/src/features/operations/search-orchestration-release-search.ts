import { Context, Effect, Layer } from "effect";

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
import { loadRuntimeConfig } from "@/features/operations/repository/config-repository.ts";
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
) => Effect.Effect<readonly ParsedRelease[], SearchReleaseSourceError, never>;

export function makeSearchReleaseSupport(input: {
  db: AppDatabase;
  rssClient: typeof RssClient.Service;
  seadexClient: typeof SeaDexClient.Service;
}) {
  const { db, rssClient, seadexClient } = input;

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

    if (!entry || entry.releases.length === 0) {
      return [...releases];
    }

    return releases.map((release) => applySeaDexMatch(release, entry));
  });

  const searchEpisodeReleases = Effect.fn("OperationsService.searchEpisodeReleases")(function* (
    animeRow: typeof anime.$inferSelect,
    episodeNumber: number,
    config: Config,
  ) {
    const results = yield* collectEpisodeSearchReleases(
      animeRow,
      episodeNumber,
      config,
      searchNyaaReleases,
    );

    return yield* enrichSeaDexReleases(animeRow, results.slice(0, 10), config);
  });

  const searchReleasesBase = Effect.fn("OperationsService.searchReleasesBase")(function* (
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
      Effect.mapError(mapSearchReleaseError),
    );

    const enrichedResults = animeRow
      ? yield* enrichSeaDexReleases(animeRow, results, runtimeConfig).pipe(
          Effect.mapError(mapSearchReleaseError),
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

  const searchReleases = Effect.fn("OperationsService.searchReleases")(function* (
    query: string,
    animeId?: number,
    category?: string,
    filter?: string,
  ) {
    return yield* searchReleasesBase(query, animeId, category, filter).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError ||
        error instanceof ExternalCallError ||
        error instanceof OperationsInputError
          ? error
          : new OperationsInfrastructureError({
              message: "Failed to search releases",
              cause: error,
            }),
      ),
    );
  });

  return {
    enrichSeaDexReleases,
    searchEpisodeReleases,
    searchNyaaReleases,
    searchReleases,
    searchReleasesBase,
  };
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
): Effect.Effect<ParsedRelease[], SearchReleaseSourceError, never> {
  return Effect.gen(function* () {
    const results: ParsedRelease[] = [];

    for (const query of buildEpisodeSearchQueries(animeRow, episodeNumber)) {
      const items = yield* searchNyaaReleases(query, config);

      for (const item of items) {
        if (!shouldKeepEpisodeRelease(item, episodeNumber)) {
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

    return results;
  });
}

export type SearchReleaseServiceShape = ReturnType<typeof makeSearchReleaseSupport>;

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

    return makeSearchReleaseSupport({
      db,
      rssClient,
      seadexClient,
    });
  }),
);
