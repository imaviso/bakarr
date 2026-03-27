import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeFileService, AnimeQueryService } from "../features/anime/service.ts";
import { CatalogOrchestration } from "../features/operations/operations-orchestration.ts";
import {
  ListAnimeQuerySchema,
  SearchAnimeQuerySchema,
  StreamUrlQuerySchema,
} from "./anime-request-schemas.ts";
import { IdParamsSchema } from "./common-request-schemas.ts";
import { buildAnimeStreamUrl } from "./anime-streaming.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQuery,
  jsonResponse,
} from "./router-helpers.ts";

export const animeReadRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/anime",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(ListAnimeQuerySchema);
        return yield* (yield* AnimeQueryService).listAnime({
          limit: query.limit,
          monitored: query.monitored,
          offset: query.offset,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/search",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SearchAnimeQuerySchema);
        return yield* (yield* AnimeQueryService).searchAnime(query.q ?? "");
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/anilist/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).getAnimeByAnilistId(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).getAnime(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/episodes",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).listEpisodes(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/files",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeFileService).listFiles(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogOrchestration).listAnimeRssFeeds(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rename-preview",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogOrchestration).getRenamePreview(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/stream-url",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQuery(StreamUrlQuerySchema);
        return yield* buildAnimeStreamUrl({
          animeId: params.id,
          episodeNumber: query.episodeNumber,
        });
      }),
      jsonResponse,
    ),
  ),
);
