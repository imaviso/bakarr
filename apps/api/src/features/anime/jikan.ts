import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Option, Schema } from "effect";

import {
  JikanAnimeDetailFullPayloadSchema,
  JikanAnimeDetailPayloadSchema,
  JikanNormalizedAnimeFromDetailSchema,
  JikanNormalizedAnimeFromFullSchema,
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
      const full = yield* fetchFullDetail(client, externalCall, malId);

      if (Option.isSome(full)) {
        return full;
      }

      return yield* fetchBasicDetail(client, externalCall, malId);
    });

    return JikanClient.of({ getAnimeByMalId });
  }),
);

const fetchFullDetail = Effect.fn("JikanClient.fetchFullDetail")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  malId: number,
) {
  const response = yield* callJikan(client, externalCall, malId, "full");

  if (Option.isNone(response)) {
    return Option.none<JikanNormalizedAnime>();
  }

  const payload = yield* HttpClientResponse.schemaBodyJson(JikanAnimeDetailFullPayloadSchema)(
    response.value,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan full response decode failed",
        operation: "jikan.detail.full.json",
      }),
    ),
  );

  const normalized = yield* Schema.decodeUnknown(JikanNormalizedAnimeFromFullSchema)(
    payload.data,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan full response normalization failed",
        operation: "jikan.detail.full.normalize",
      }),
    ),
  );

  return Option.some(normalized);
});

const fetchBasicDetail = Effect.fn("JikanClient.fetchBasicDetail")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  malId: number,
) {
  const response = yield* callJikan(client, externalCall, malId, "basic");

  if (Option.isNone(response)) {
    return Option.none<JikanNormalizedAnime>();
  }

  const payload = yield* HttpClientResponse.schemaBodyJson(JikanAnimeDetailPayloadSchema)(
    response.value,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Jikan detail response decode failed",
        operation: "jikan.detail.basic.json",
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
        operation: "jikan.detail.basic.normalize",
      }),
    ),
  );

  return Option.some(normalized);
});

const callJikan = Effect.fn("JikanClient.callJikan")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  malId: number,
  mode: "full" | "basic",
) {
  const pathSuffix = mode === "full" ? "/full" : "";

  const url = yield* Effect.try({
    try: () => `${JIKAN_URL}/anime/${malId}${pathSuffix}`,
    catch: (cause) =>
      ExternalCallError.make({
        cause,
        message: "Failed to build Jikan request URL",
        operation: `jikan.detail.${mode}.request`,
      }),
  });

  const request = HttpClientRequest.get(url);
  const response = yield* externalCall.tryExternalEffect(
    `jikan.detail.${mode}`,
    client.execute(request),
  );

  if (response.status === 404) {
    return Option.none<HttpClientResponse.HttpClientResponse>();
  }

  if (response.status < 200 || response.status >= 300) {
    return yield* ExternalCallError.make({
      cause: new Error(`Jikan detail ${mode} failed with status ${response.status}`),
      message: `Jikan detail ${mode} failed`,
      operation: `jikan.detail.${mode}.response`,
    });
  }

  return Option.some(response);
});
