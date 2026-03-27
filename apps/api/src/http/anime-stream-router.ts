import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeEpisodeParamsSchema } from "./anime-request-schemas.ts";
import { buildAnimeStreamResponse } from "./anime-streaming.ts";
import { decodePathParams, routeResponse } from "./router-helpers.ts";

export const animeStreamRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/stream/:id/:episodeNumber",
    routeResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        return yield* buildAnimeStreamResponse({
          animeId: params.id,
          episodeNumber: params.episodeNumber,
        });
      }),
      Effect.succeed,
    ),
  ),
);
