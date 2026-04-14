import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Option, Schema } from "effect";

import {
  JikanAnimeDetailFullPayloadSchema,
  JikanAnimeDetailPayloadSchema,
  JikanAnimeRecommendationsPayloadSchema,
  JikanNormalizedAnimeFromDetailSchema,
  JikanNormalizedAnimeFromFullSchema,
  normalizeJikanRecommendations,
  type JikanNormalizedAnime,
} from "@/features/anime/jikan-model.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/lib/effect-retry.ts";

const JIKAN_URL = "https://api.jikan.moe/v4";

interface JikanClientShape {
  readonly getAnimeByMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<JikanNormalizedAnime>, ExternalCallError>;
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

    return JikanClient.of({ getAnimeByMalId });
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
    `/anime/${malId}/full`,
    "jikan.detail.full",
  );

  if (Option.isSome(fullResponse)) {
    return yield* decodeFullDetail(fullResponse.value);
  }

  const basicResponse = yield* callJikan(
    client,
    externalCall,
    `/anime/${malId}`,
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
  const response = yield* callJikan(
    client,
    externalCall,
    `/anime/${malId}/recommendations`,
    "jikan.detail.recommendations",
  );

  if (Option.isNone(response)) {
    return [];
  }

  const payload = yield* HttpClientResponse.schemaBodyJson(JikanAnimeRecommendationsPayloadSchema)(
    response.value,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan recommendations decode failed",
        operation: "jikan.detail.recommendations.json",
      }),
    ),
  );

  return normalizeJikanRecommendations(payload.data);
});

const callJikan = Effect.fn("JikanClient.callJikan")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  path: string,
  operation: string,
) {
  const url = yield* Effect.try({
    try: () => `${JIKAN_URL}${path}`,
    catch: (cause) =>
      ExternalCallError.make({
        cause,
        message: "Failed to build Jikan request URL",
        operation: `${operation}.request`,
      }),
  });

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
