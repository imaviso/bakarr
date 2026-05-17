import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Option, Schema } from "effect";
import type { MediaSeason } from "@packages/shared/index.ts";

import {
  JikanAnimeDetailFullPayloadSchema,
  JikanAnimeDetailPayloadSchema,
  JikanAnimeRecommendationsPayloadSchema,
  JikanNormalizedAnimeFromDetailSchema,
  JikanNormalizedAnimeFromFullSchema,
  JikanSeasonalEntryFromDetailSchema,
  JikanSeasonalPayloadSchema,
  normalizeJikanRecommendations,
  type JikanNormalizedAnime,
  type JikanNormalizedSeasonalEntry,
} from "@/features/media/metadata/jikan-model.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";

const JIKAN_URL = "https://api.jikan.moe/v4";

interface JikanClientShape {
  readonly getAnimeByMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<JikanNormalizedAnime>, ExternalCallError>;
  readonly getSeasonalAnime: (input: {
    season: MediaSeason;
    year: number;
    limit: number;
    page?: number;
  }) => Effect.Effect<ReadonlyArray<JikanNormalizedSeasonalEntry>, ExternalCallError>;
}

export class JikanClient extends Context.Tag("@bakarr/api/JikanClient")<
  JikanClient,
  JikanClientShape
>() {}

export const JikanClientLive = Layer.effect(
  JikanClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const externalCall = yield* ExternalCall;

    const getAnimeByMalId = Effect.fn("JikanClient.getAnimeByMalId")(function* (malId: number) {
      const detail = yield* fetchDetail(client, externalCall, malId);

      if (Option.isNone(detail)) {
        return Option.none<JikanNormalizedAnime>();
      }

      const recommendations = yield* fetchRecommendations(client, externalCall, malId);

      return Option.some({
        ...detail.value,
        recommendations,
      });
    });

    const getSeasonalAnime = Effect.fn("JikanClient.getSeasonalAnime")(function* (input: {
      season: MediaSeason;
      year: number;
      limit: number;
      page?: number;
    }) {
      const response = yield* callJikan(
        client,
        externalCall,
        `/seasons/${input.year}/${input.season}?limit=${input.limit}&page=${input.page ?? 1}`,
        "jikan.seasonal",
      );

      if (Option.isNone(response)) {
        return [];
      }

      const payload = yield* HttpClientResponse.schemaBodyJson(JikanSeasonalPayloadSchema)(
        response.value,
      ).pipe(
        Effect.mapError((cause) =>
          ExternalCallError.make({
            cause,
            message: "Jikan seasonal response decode failed",
            operation: "jikan.seasonal.json",
          }),
        ),
      );

      const entries = yield* Effect.forEach(payload.data, (entry) =>
        Schema.decodeUnknown(JikanSeasonalEntryFromDetailSchema)(entry).pipe(
          Effect.mapError((cause) =>
            ExternalCallError.make({
              cause,
              message: "Jikan seasonal entry normalization failed",
              operation: "jikan.seasonal.normalize",
            }),
          ),
        ),
      );

      return entries.slice(0, input.limit);
    });

    return JikanClient.of({ getAnimeByMalId, getSeasonalAnime });
  }),
);

const fetchDetail = Effect.fn("JikanClient.fetchDetail")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  malId: number,
) {
  const fullResponse = yield* callJikan(
    client,
    externalCall,
    `/media/${malId}/full`,
    "jikan.detail.full",
  );

  if (Option.isSome(fullResponse)) {
    const fullDetail = yield* decodeFullDetail(fullResponse.value).pipe(
      Effect.catchTag("ExternalCallError", (error) =>
        Effect.logWarning("Jikan full detail unavailable; falling back to basic detail").pipe(
          Effect.annotateLogs({
            externalOperation: "jikan.detail.full",
            operation: error.operation,
          }),
          Effect.as(Option.none<JikanNormalizedAnime>()),
        ),
      ),
    );

    if (Option.isSome(fullDetail)) {
      return fullDetail;
    }
  }

  const basicResponse = yield* callJikan(
    client,
    externalCall,
    `/media/${malId}`,
    "jikan.detail.basic",
  );

  if (Option.isNone(basicResponse)) {
    return Option.none<JikanNormalizedAnime>();
  }

  return yield* decodeBasicDetail(basicResponse.value);
});

const decodeFullDetail = Effect.fn("JikanClient.decodeFullDetail")(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  const payload = yield* HttpClientResponse.schemaBodyJson(JikanAnimeDetailFullPayloadSchema)(
    response,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan detail response decode failed",
        operation: "jikan.detail.json",
      }),
    ),
  );

  const normalized = yield* Schema.decodeUnknown(JikanNormalizedAnimeFromFullSchema)(
    payload.data,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan detail response normalization failed",
        operation: "jikan.detail.normalize",
      }),
    ),
  );

  return Option.some(normalized);
});

const decodeBasicDetail = Effect.fn("JikanClient.decodeBasicDetail")(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  const payload = yield* HttpClientResponse.schemaBodyJson(JikanAnimeDetailPayloadSchema)(
    response,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan detail response decode failed",
        operation: "jikan.detail.json",
      }),
    ),
  );

  const normalized = yield* Schema.decodeUnknown(JikanNormalizedAnimeFromDetailSchema)(
    payload.data,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan detail response normalization failed",
        operation: "jikan.detail.normalize",
      }),
    ),
  );

  return Option.some(normalized);
});

const fetchRecommendations = Effect.fn("JikanClient.fetchRecommendations")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  malId: number,
) {
  return yield* Effect.gen(function* () {
    const response = yield* callJikan(
      client,
      externalCall,
      `/media/${malId}/recommendations`,
      "jikan.detail.recommendations",
    );

    if (Option.isNone(response)) {
      return [];
    }

    const payload = yield* HttpClientResponse.schemaBodyJson(
      JikanAnimeRecommendationsPayloadSchema,
    )(response.value).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "Jikan recommendations decode failed",
          operation: "jikan.detail.recommendations.json",
        }),
      ),
    );

    return normalizeJikanRecommendations(payload.data);
  }).pipe(
    Effect.catchTag("ExternalCallError", (error) =>
      Effect.logWarning(
        "Jikan recommendations unavailable; continuing without recommendations",
      ).pipe(
        Effect.annotateLogs({
          externalOperation: "jikan.detail.recommendations",
          operation: error.operation,
        }),
        Effect.as([]),
      ),
    ),
  );
});

const callJikan = Effect.fn("JikanClient.callJikan")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  path: string,
  operation: string,
) {
  const url = `${JIKAN_URL}${path}`;

  const request = HttpClientRequest.get(url);
  const response = yield* externalCall.tryExternalEffect(operation, client.execute(request));

  if (response.status === 404) {
    return Option.none<HttpClientResponse.HttpClientResponse>();
  }

  if (response.status < 200 || response.status >= 300) {
    return yield* ExternalCallError.make({
      cause: new Error(`Jikan ${operation} failed with status ${response.status}`),
      message: `Jikan ${operation} failed`,
      operation: `${operation}.response`,
    });
  }

  return Option.some(response);
});
