import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import type { MediaSeason, MediaKind } from "@packages/shared/index.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";
import { callProviderJson } from "@/infra/effect/provider-http.ts";
import type {
  AnimeMetadata,
  ProviderMediaSearchResult,
} from "@/features/media/metadata/metadata-model.ts";
import {
  Clock,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Record,
  Ref,
  Schema,
  Semaphore,
} from "effect";
import type { DatabaseError } from "@/db/database.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { DEFAULT_ANILIST_REQUESTS_PER_MINUTE } from "@/features/system/metadata-providers-config.ts";
import {
  AnimeMetadataFromAniListSchema,
  AnimeSearchResultFromAniListSchema,
  AniListDetailPayloadSchema,
  AniListSearchPayloadSchema,
  AniListSeasonalPayloadSchema,
} from "@/features/media/metadata/anilist-model.ts";

const ANILIST_URL = "https://graphql.anilist.co";

// Shared by every AniList query (search/detail/seasonal, user or background).
// The per-minute cap lives in system settings (metadata.anilist) so it can be
// tuned live; AniList enforces ~90 requests/minute per IP and the UI caps at
// that. Snapshot reads are in-memory after first load.
const ANILIST_RATE_LIMIT_WINDOW_MS = 60_000;

const ANILIST_SEASON_MAP: Record<MediaSeason, "WINTER" | "SPRING" | "SUMMER" | "FALL"> = {
  winter: "WINTER",
  spring: "SPRING",
  summer: "SUMMER",
  fall: "FALL",
};

const SEARCH_ANIME_QUERY = `query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: $type, sort: SEARCH_MATCH) {
      id
      format
      status
      episodes
      chapters
      volumes
      duration
      favourites
      popularity
      rankings {
        rank
        type
        allTime
      }
      source
      description(asHtml: false)
      genres
      synonyms
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      title {
        romaji
        english
        native
      }
      coverImage {
        extraLarge
        large
      }
      bannerImage
      relations {
        edges {
          relationType
          node {
            id
            format
            status
            averageScore
            startDate {
              year
              month
              day
            }
            title {
              romaji
              english
              native
            }
            coverImage {
              extraLarge
              large
            }
          }
        }
      }
      recommendations(perPage: 6, sort: RATING_DESC) {
        nodes {
          mediaRecommendation {
            id
            format
            status
            averageScore
            startDate {
              year
              month
              day
            }
            title {
              romaji
              english
              native
            }
            coverImage {
              extraLarge
              large
            }
          }
        }
      }
    }
  }
}`;

const DETAIL_ANIME_QUERY = `query ($id: Int, $type: MediaType) {
  Media(id: $id, type: $type) {
    id
    idMal
    format
    status
    episodes
    chapters
    volumes
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    description(asHtml: false)
    averageScore
    duration
    favourites
    popularity
    rankings {
      rank
      type
      allTime
    }
    source
    genres
    synonyms
    nextAiringEpisode {
      episode
      airingAt
    }
    airingSchedule(notYetAired: true, perPage: 32) {
      nodes {
        episode
        airingAt
      }
    }
    title {
      romaji
      english
      native
    }
    coverImage {
      extraLarge
      large
    }
    bannerImage
    studios(isMain: true) {
      nodes {
        name
      }
    }
    relations {
      edges {
        relationType
        node {
          id
          format
          status
          averageScore
          startDate {
            year
            month
            day
          }
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
          }
        }
      }
    }
    recommendations(perPage: 8, sort: RATING_DESC) {
      nodes {
        mediaRecommendation {
          id
          format
          status
          averageScore
          startDate {
            year
            month
            day
          }
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
          }
        }
      }
    }
  }
}`;

const ID_MAL_LOOKUP_QUERY = `query ($malId: Int) {
  Media(idMal: $malId) {
    id
  }
}`;

const AniListIdMalLookupPayloadSchema = Schema.Struct({
  data: Schema.Struct({
    Media: Schema.NullOr(
      Schema.Struct({
        id: Schema.Number,
      }),
    ),
  }),
});

const SEASONAL_ANIME_QUERY = `query ($season: MediaSeason, $seasonYear: Int, $perPage: Int, $page: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC) {
      id
      format
      status
      episodes
      duration
      favourites
      popularity
      rankings {
        rank
        type
        allTime
      }
      source
      description(asHtml: false)
      genres
      synonyms
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      title {
        romaji
        english
        native
      }
      coverImage {
        extraLarge
        large
      }
      bannerImage
      relations {
        edges {
          relationType
          node {
            id
            format
            status
            averageScore
            startDate {
              year
              month
              day
            }
            title {
              romaji
              english
              native
            }
            coverImage {
              extraLarge
              large
            }
          }
        }
      }
      recommendations(perPage: 6, sort: RATING_DESC) {
        nodes {
          mediaRecommendation {
            id
            format
            status
            averageScore
            startDate {
              year
              month
              day
            }
            title {
              romaji
              english
              native
            }
            coverImage {
              extraLarge
              large
            }
          }
        }
      }
    }
  }
}`;

interface AniListClientShape {
  readonly searchAnimeMetadata: (
    query: string,
    mediaKind?: MediaKind,
  ) => Effect.Effect<ProviderMediaSearchResult[], ExternalCallError>;
  readonly getAnimeMetadataById: (
    id: number,
    mediaKind?: MediaKind,
  ) => Effect.Effect<Option.Option<AnimeMetadata>, ExternalCallError>;
  readonly getSeasonalAnime: (input: {
    season: MediaSeason;
    year: number;
    limit: number;
    page?: number;
  }) => Effect.Effect<ProviderMediaSearchResult[], ExternalCallError>;
  readonly resolveAniListIdFromMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<number>, ExternalCallError>;
}

const makeAniListClient = Effect.fn("AniListClient.make")(function* () {
  const client = yield* HttpClient.HttpClient;
  const externalCall = yield* ExternalCall;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const requestTimestamps = yield* Ref.make<ReadonlyArray<number>>([]);
  const requestGate = yield* Semaphore.make(1);

  // Sliding-window gate: at most `requestsPerMinute` upstream calls per rolling
  // minute, shared by all three operations. One slot per logical query —
  // retries of the same call reuse its slot. Fibers decide under a
  // single-permit gate and sleep outside it, so TestClock controls the wait.
  // The cap resolves per query so settings changes apply without restart; a
  // config load failure surfaces as ExternalCallError so existing fallbacks
  // (stale detail) engage.
  const acquireRequestSlot = Effect.fn("AniListClient.acquireRequestSlot")(function* () {
    const requestsPerMinute = yield* resolveRequestsPerMinute(runtimeConfigSnapshot);
    while (true) {
      const waitMs = yield* requestGate.withPermits(1)(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const windowStart = now - ANILIST_RATE_LIMIT_WINDOW_MS;
          const recent: Array<number> = [];
          let oldest = Number.POSITIVE_INFINITY;
          for (const timestamp of yield* Ref.get(requestTimestamps)) {
            if (timestamp > windowStart) {
              recent.push(timestamp);
              if (timestamp < oldest) {
                oldest = timestamp;
              }
            }
          }
          if (recent.length < requestsPerMinute) {
            yield* Ref.set(requestTimestamps, [...recent, now]);
            return 0;
          }
          return Math.max(oldest + ANILIST_RATE_LIMIT_WINDOW_MS - now, 1);
        }),
      );
      if (waitMs <= 0) {
        return;
      }
      yield* Effect.sleep(Duration.millis(waitMs));
    }
  });

  const searchAnimeMetadata = Effect.fn("AniListClient.searchAnimeMetadata")(function* (
    query: string,
    mediaKind: MediaKind = "anime",
  ) {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return [];
    }

    yield* acquireRequestSlot();
    return yield* trySearchRemote(client, externalCall, trimmed, mediaKind);
  });

  const getAnimeMetadataById = Effect.fn("AniListClient.getAnimeMetadataById")(function* (
    id: number,
    mediaKind?: MediaKind,
  ) {
    yield* acquireRequestSlot();
    return yield* tryFetchDetail(client, externalCall, id, mediaKind);
  });

  const getSeasonalAnime = Effect.fn("AniListClient.getSeasonalAnime")(function* (input: {
    season: MediaSeason;
    year: number;
    limit: number;
    page?: number;
  }) {
    yield* acquireRequestSlot();
    return yield* tryFetchSeasonal(client, externalCall, input);
  });

  const resolveAniListIdFromMalId = Effect.fn("AniListClient.resolveAniListIdFromMalId")(function* (
    malId: number,
  ) {
    yield* acquireRequestSlot();
    const payload = yield* callAniList(
      client,
      externalCall,
      "resolveId",
      ID_MAL_LOOKUP_QUERY,
      { malId },
      AniListIdMalLookupPayloadSchema,
    );
    return Option.fromNullishOr(payload.data.Media?.id);
  });

  const service: AniListClientShape = {
    getAnimeMetadataById,
    getSeasonalAnime,
    resolveAniListIdFromMalId,
    searchAnimeMetadata,
  };
  return service;
});

export class AniListClient extends Context.Service<AniListClient, AniListClientShape>()(
  "@bakarr/api/AniListClient",
) {
  static readonly layer = Layer.effect(AniListClient, makeAniListClient());
}

export const AniListClientLive = AniListClient.layer;

const resolveRequestsPerMinute = Effect.fn("AniListClient.resolveRequestsPerMinute")(function* (
  runtimeConfigSnapshot: typeof RuntimeConfigSnapshotService.Service,
) {
  const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
    Effect.map((config) => Option.some(config)),
    Effect.catchTag("StoredConfigMissingError", () => Effect.succeed(Option.none())),
    Effect.catchTag("StoredConfigCorruptError", (error) => failRateLimitConfigLoad(error)),
    Effect.catchTag("DatabaseError", (error) => failRateLimitConfigLoad(error)),
  );

  if (Option.isNone(runtimeConfig)) {
    return DEFAULT_ANILIST_REQUESTS_PER_MINUTE;
  }

  return (
    runtimeConfig.value.metadata?.anilist?.requests_per_minute ??
    DEFAULT_ANILIST_REQUESTS_PER_MINUTE
  );
});

const failRateLimitConfigLoad = (error: StoredConfigCorruptError | DatabaseError) =>
  Effect.fail(
    ExternalCallError.make({
      cause: error,
      message: "Failed to load AniList rate limit config",
      operation: "anilist.ratelimit.config",
    }),
  );

const callAniList = <A, I>(
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  operation: string,
  query: string,
  variables: Readonly<Record<string, string | number | boolean | undefined>>,
  schema: Schema.Codec<A, I>,
): Effect.Effect<A, ExternalCallError> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(ANILIST_URL).pipe(
      HttpClientRequest.bodyJson({ query, variables }),
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: `Failed to encode AniList ${operation} request body`,
          operation: `anilist.${operation}.request`,
        }),
      ),
    );

    return yield* callProviderJson({
      client,
      externalCall,
      failureMessage: `AniList ${operation}`,
      operation: `anilist.${operation}`,
      request,
      schema,
    });
  });

const trySearchRemote = Effect.fn("AniListClient.trySearchRemote")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  trimmed: string,
  mediaKind: MediaKind,
) {
  const payload = yield* callAniList(
    client,
    externalCall,
    "search",
    SEARCH_ANIME_QUERY,
    { search: trimmed, type: toAniListMediaType(mediaKind) },
    AniListSearchPayloadSchema,
  );

  return yield* Effect.forEach(payload.data.Page.media, (entry) =>
    Schema.decodeUnknownEffect(AnimeSearchResultFromAniListSchema)(entry).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "AniList search result normalization failed",
          operation: "anilist.search.normalize",
        }),
      ),
    ),
  );
});

const tryFetchDetail = Effect.fn("AniListClient.tryFetchDetail")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  id: number,
  mediaKind: MediaKind | undefined,
) {
  const payload = yield* callAniList(
    client,
    externalCall,
    "detail",
    DETAIL_ANIME_QUERY,
    { id, type: toOptionalAniListMediaType(mediaKind) },
    AniListDetailPayloadSchema,
  );
  const media = payload.data.Media;

  if (!media) {
    return Option.none();
  }

  const decoded = yield* Schema.decodeUnknownEffect(AnimeMetadataFromAniListSchema)(media).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "AniList detail normalization failed",
        operation: "anilist.detail.normalize",
      }),
    ),
  );

  return Option.some(decoded);
});

function toAniListMediaType(mediaKind: MediaKind) {
  return mediaKind === "anime" ? "ANIME" : "MANGA";
}

function toOptionalAniListMediaType(mediaKind: MediaKind | undefined) {
  return mediaKind === undefined ? undefined : toAniListMediaType(mediaKind);
}

const tryFetchSeasonal = Effect.fn("AniListClient.tryFetchSeasonal")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  input: { season: MediaSeason; year: number; limit: number; page?: number },
) {
  const seasonEnum = ANILIST_SEASON_MAP[input.season];

  const payload = yield* callAniList(
    client,
    externalCall,
    "seasonal",
    SEASONAL_ANIME_QUERY,
    {
      page: input.page ?? 1,
      perPage: input.limit,
      season: seasonEnum,
      seasonYear: input.year,
    },
    AniListSeasonalPayloadSchema,
  );

  return yield* Effect.forEach(payload.data.Page.media, (entry) =>
    Schema.decodeUnknownEffect(AnimeSearchResultFromAniListSchema)(entry).pipe(
      Effect.map((decoded) => ({
        ...decoded,
        season: decoded.season ?? input.season,
        season_year: decoded.season_year ?? input.year,
      })),
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "AniList seasonal result normalization failed",
          operation: "anilist.seasonal.normalize",
        }),
      ),
    ),
  );
});
