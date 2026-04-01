import { HttpServerRequest, HttpServerResponse, HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeStreamService } from "@/features/anime/anime-stream-service.ts";
import { AnimeEpisodeParamsSchema, StreamQuerySchema } from "@/http/anime-request-schemas.ts";
import { EpisodeStreamAccessError } from "@/http/streaming-errors.ts";
import { decodePathParams, decodeQueryWithLabel, routeResponse } from "@/http/router-helpers.ts";

export const animeStreamRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/stream/:id/:episodeNumber",
    routeResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        const query = yield* decodeQueryWithLabel(StreamQuerySchema, "stream access").pipe(
          Effect.mapError(
            () => new EpisodeStreamAccessError({ message: "Forbidden or expired", status: 403 }),
          ),
        );

        const request = yield* HttpServerRequest.HttpServerRequest;
        const streamService = yield* AnimeStreamService;
        const response = yield* streamService.buildEpisodeStreamResponse({
          animeId: params.id,
          episodeNumber: params.episodeNumber,
          expiresAt: query.exp,
          rangeHeader: request.headers.range,
          signatureHex: query.sig,
        });

        return HttpServerResponse.stream(response.stream, {
          contentType: response.contentType,
          headers: response.headers,
          status: response.status,
        });
      }),
      Effect.succeed,
    ),
  ),
);
