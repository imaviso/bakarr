import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { MediaSeason } from "@packages/shared/index.ts";

import {
  TenraiAnimeDetailFullPayloadSchema,
  TenraiAnimeDetailPayloadSchema,
  TenraiAnimeRecommendationsPayloadSchema,
  TenraiNormalizedAnimeFromDetailSchema,
  TenraiNormalizedAnimeFromFullSchema,
  TenraiSeasonalEntryFromDetailSchema,
  TenraiSeasonalPayloadSchema,
  normalizeTenraiRecommendations,
  type TenraiNormalizedAnime,
  type TenraiNormalizedSeasonalEntry,
} from "@/features/media/metadata/tenrai-model.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";
import { executeProviderRequest } from "@/infra/effect/provider-http.ts";
import { Clock, Context, Duration, Effect, Layer, Option, Ref, Schema, Semaphore } from "effect";
import type { DatabaseError } from "@/db/database.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { DEFAULT_TENRAI_REQUESTS_PER_MINUTE } from "@/features/system/metadata-providers-config.ts";

const TENRAI_URL = "https://api.tenrai.org/v1";

// Public Tenrai limits: 120 requests/minute, 4 requests/second, 40,000/day.
// The minute+second gates below bound every upstream call; the daily cap is
// unreachable for single-user self-host use so it is not tracked.
const TENRAI_RATE_LIMIT_WINDOW_MS = 60_000;
const TENRAI_RATE_LIMIT_SECOND_MS = 1_000;
const TENRAI_MAX_REQUESTS_PER_SECOND = 4;

interface TenraiClientShape {
  readonly getAnimeByMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<TenraiNormalizedAnime>, ExternalCallError>;
  readonly searchAnime: (
    query: string,
    limit?: number,
    page?: number,
  ) => Effect.Effect<
    { entries: ReadonlyArray<TenraiNormalizedSeasonalEntry>; hasMore: boolean },
    ExternalCallError
  >;
  readonly getSeasonalAnime: (input: {
    season: MediaSeason;
    year: number;
    limit: number;
    page?: number;
  }) => Effect.Effect<
    { entries: ReadonlyArray<TenraiNormalizedSeasonalEntry>; hasMore: boolean },
    ExternalCallError
  >;
}

const makeTenraiClient = Effect.fn("TenraiClient.make")(function* () {
  const client = yield* HttpClient.HttpClient;
  const externalCall = yield* ExternalCall;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const requestTimestamps = yield* Ref.make<ReadonlyArray<number>>([]);
  const requestGate = yield* Semaphore.make(1);

  // Dual sliding-window gate: at most 4 upstream calls per rolling second
  // and `requestsPerMinute` per rolling minute, shared by all operations.
  // One slot per upstream call — retries of the same call reuse its slot.
  // Fibers decide under a single-permit gate and sleep outside it, so
  // TestClock controls the wait. The minute cap resolves per query so
  // settings changes apply without restart; a config load failure surfaces
  // as ExternalCallError so existing fallbacks engage.
  const acquireRequestSlot = Effect.fn("TenraiClient.acquireRequestSlot")(function* () {
    const requestsPerMinute = yield* resolveRequestsPerMinute(runtimeConfigSnapshot);
    while (true) {
      const waitMs = yield* requestGate.withPermits(1)(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const minuteStart = now - TENRAI_RATE_LIMIT_WINDOW_MS;
          const secondStart = now - TENRAI_RATE_LIMIT_SECOND_MS;
          const recent: Array<number> = [];
          let oldestMinute = Number.POSITIVE_INFINITY;
          let oldestSecond = Number.POSITIVE_INFINITY;
          let secondCount = 0;
          for (const timestamp of yield* Ref.get(requestTimestamps)) {
            if (timestamp > minuteStart) {
              recent.push(timestamp);
              if (timestamp < oldestMinute) {
                oldestMinute = timestamp;
              }
              if (timestamp > secondStart) {
                secondCount += 1;
                if (timestamp < oldestSecond) {
                  oldestSecond = timestamp;
                }
              }
            }
          }
          let wait = 0;
          if (recent.length >= requestsPerMinute) {
            wait = Math.max(wait, oldestMinute + TENRAI_RATE_LIMIT_WINDOW_MS - now);
          }
          if (secondCount >= TENRAI_MAX_REQUESTS_PER_SECOND) {
            wait = Math.max(wait, oldestSecond + TENRAI_RATE_LIMIT_SECOND_MS - now);
          }
          if (wait > 0) {
            return Math.max(wait, 1);
          }
          yield* Ref.set(requestTimestamps, [...recent, now]);
          return 0;
        }),
      );
      if (waitMs <= 0) {
        return;
      }
      yield* Effect.sleep(Duration.millis(waitMs));
    }
  });

  const request = Effect.fn("TenraiClient.request")(function* (path: string, operation: string) {
    yield* acquireRequestSlot();
    return yield* callTenrai(client, externalCall, path, operation);
  });

  const getAnimeByMalId = Effect.fn("TenraiClient.getAnimeByMalId")(function* (malId: number) {
    const detail = yield* fetchDetail(request, malId);

    if (Option.isNone(detail)) {
      return Option.none<TenraiNormalizedAnime>();
    }

    const recommendations = yield* fetchRecommendations(request, malId);

    return Option.some({
      ...detail.value,
      recommendations,
    });
  });

  const getSeasonalAnime = Effect.fn("TenraiClient.getSeasonalAnime")(function* (input: {
    season: MediaSeason;
    year: number;
    limit: number;
    page?: number;
  }) {
    const response = yield* request(
      `/seasons/${input.year}/${input.season}?limit=${input.limit}&page=${input.page ?? 1}`,
      "tenrai.seasonal",
    );

    if (Option.isNone(response)) {
      return { entries: [], hasMore: false };
    }

    return yield* decodeEntryList(response.value, input.limit, {
      entryMessage: "Tenrai seasonal entry normalization failed",
      jsonOperation: "tenrai.seasonal.json",
      normalizeOperation: "tenrai.seasonal.normalize",
      responseMessage: "Tenrai seasonal response decode failed",
    });
  });

  const searchAnime = Effect.fn("TenraiClient.searchAnime")(function* (
    query: string,
    limit = 10,
    page = 1,
  ) {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return { entries: [], hasMore: false };
    }

    const response = yield* request(
      `/anime?q=${encodeURIComponent(trimmed)}&limit=${limit}&page=${page}&order_by=members&sort=desc`,
      "tenrai.search",
    );

    if (Option.isNone(response)) {
      return { entries: [], hasMore: false };
    }

    return yield* decodeEntryList(response.value, limit, {
      entryMessage: "Tenrai search entry normalization failed",
      jsonOperation: "tenrai.search.json",
      normalizeOperation: "tenrai.search.normalize",
      responseMessage: "Tenrai search response decode failed",
    });
  });

  return { getAnimeByMalId, getSeasonalAnime, searchAnime } satisfies TenraiClientShape;
});

export class TenraiClient extends Context.Service<TenraiClient, TenraiClientShape>()(
  "@bakarr/api/TenraiClient",
) {
  static readonly layer = Layer.effect(TenraiClient, makeTenraiClient());
}

export const TenraiClientLive = TenraiClient.layer;

type TenraiRequest = (
  path: string,
  operation: string,
) => Effect.Effect<Option.Option<HttpClientResponse.HttpClientResponse>, ExternalCallError>;

const decodeEntryList = Effect.fn("TenraiClient.decodeEntryList")(function* (
  response: HttpClientResponse.HttpClientResponse,
  limit: number,
  operation: {
    readonly entryMessage: string;
    readonly jsonOperation: string;
    readonly normalizeOperation: string;
    readonly responseMessage: string;
  },
) {
  const payload = yield* HttpClientResponse.schemaBodyJson(TenraiSeasonalPayloadSchema)(
    response,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: operation.responseMessage,
        operation: operation.jsonOperation,
      }),
    ),
  );

  const entries = yield* Effect.forEach(payload.data, (entry) =>
    Schema.decodeUnknownEffect(TenraiSeasonalEntryFromDetailSchema)(entry).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: operation.entryMessage,
          operation: operation.normalizeOperation,
        }),
      ),
    ),
  );

  return {
    entries: entries.slice(0, limit),
    hasMore: payload.pagination?.has_next_page === true,
  };
});

const fetchDetail = Effect.fn("TenraiClient.fetchDetail")(function* (
  request: TenraiRequest,
  malId: number,
) {
  const fullResponse = yield* request(`/anime/${malId}/full`, "tenrai.detail.full");

  if (Option.isSome(fullResponse)) {
    const fullDetail = yield* decodeFullDetail(fullResponse.value).pipe(
      Effect.catchTag("ExternalCallError", (error) =>
        Effect.logWarning("Tenrai full detail unavailable; falling back to basic detail").pipe(
          Effect.annotateLogs({
            externalOperation: "tenrai.detail.full",
            operation: error.operation,
          }),
          Effect.as(Option.none<TenraiNormalizedAnime>()),
        ),
      ),
    );

    if (Option.isSome(fullDetail)) {
      return fullDetail;
    }
  }

  const basicResponse = yield* request(`/anime/${malId}`, "tenrai.detail.basic");

  if (Option.isNone(basicResponse)) {
    return Option.none<TenraiNormalizedAnime>();
  }

  return yield* decodeBasicDetail(basicResponse.value);
});

const decodeFullDetail = Effect.fn("TenraiClient.decodeFullDetail")(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  const payload = yield* HttpClientResponse.schemaBodyJson(TenraiAnimeDetailFullPayloadSchema)(
    response,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Tenrai detail response decode failed",
        operation: "tenrai.detail.json",
      }),
    ),
  );

  const normalized = yield* Schema.decodeUnknownEffect(TenraiNormalizedAnimeFromFullSchema)(
    payload.data,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Tenrai detail response normalization failed",
        operation: "tenrai.detail.normalize",
      }),
    ),
  );

  return Option.some(normalized);
});

const decodeBasicDetail = Effect.fn("TenraiClient.decodeBasicDetail")(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  const payload = yield* HttpClientResponse.schemaBodyJson(TenraiAnimeDetailPayloadSchema)(
    response,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Tenrai detail response decode failed",
        operation: "tenrai.detail.json",
      }),
    ),
  );

  const normalized = yield* Schema.decodeUnknownEffect(TenraiNormalizedAnimeFromDetailSchema)(
    payload.data,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Tenrai detail response normalization failed",
        operation: "tenrai.detail.normalize",
      }),
    ),
  );

  return Option.some(normalized);
});

const fetchRecommendations = Effect.fn("TenraiClient.fetchRecommendations")(function* (
  request: TenraiRequest,
  malId: number,
) {
  return yield* Effect.gen(function* () {
    const response = yield* request(
      `/anime/${malId}/recommendations`,
      "tenrai.detail.recommendations",
    );

    if (Option.isNone(response)) {
      return [];
    }

    const payload = yield* HttpClientResponse.schemaBodyJson(
      TenraiAnimeRecommendationsPayloadSchema,
    )(response.value).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "Tenrai recommendations decode failed",
          operation: "tenrai.detail.recommendations.json",
        }),
      ),
    );

    return normalizeTenraiRecommendations(payload.data);
  }).pipe(
    Effect.catchTag("ExternalCallError", (error) =>
      Effect.logWarning(
        "Tenrai recommendations unavailable; continuing without recommendations",
      ).pipe(
        Effect.annotateLogs({
          externalOperation: "tenrai.detail.recommendations",
          operation: error.operation,
        }),
        Effect.as([]),
      ),
    ),
  );
});

const resolveRequestsPerMinute = Effect.fn("TenraiClient.resolveRequestsPerMinute")(function* (
  runtimeConfigSnapshot: typeof RuntimeConfigSnapshotService.Service,
) {
  const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
    Effect.map((config) => Option.some(config)),
    Effect.catchTag("StoredConfigMissingError", () => Effect.succeed(Option.none())),
    Effect.catchTag("StoredConfigCorruptError", (error) => failRateLimitConfigLoad(error)),
    Effect.catchTag("DatabaseError", (error) => failRateLimitConfigLoad(error)),
  );

  if (Option.isNone(runtimeConfig)) {
    return DEFAULT_TENRAI_REQUESTS_PER_MINUTE;
  }

  return (
    runtimeConfig.value.metadata?.tenrai?.requests_per_minute ?? DEFAULT_TENRAI_REQUESTS_PER_MINUTE
  );
});

const failRateLimitConfigLoad = (error: StoredConfigCorruptError | DatabaseError) =>
  Effect.fail(
    ExternalCallError.make({
      cause: error,
      message: "Failed to load Tenrai rate limit config",
      operation: "tenrai.ratelimit.config",
    }),
  );

const callTenrai = Effect.fn("TenraiClient.callTenrai")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  path: string,
  operation: string,
) {
  const url = `${TENRAI_URL}${path}`;

  const response = yield* executeProviderRequest({
    client,
    externalCall,
    failureMessage: `Tenrai ${operation}`,
    // 404 means "no such resource" and is surfaced as `None`, not an error.
    isExpectedStatus: (status) => status === 404 || (status >= 200 && status < 300),
    operation,
    request: HttpClientRequest.get(url),
  });

  if (response.status === 404) {
    return Option.none<HttpClientResponse.HttpClientResponse>();
  }

  return Option.some(response);
});
