import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeFileService } from "@/features/anime/files/anime-file-service.ts";
import { AnimeQueryService } from "@/features/anime/query/query-service.ts";
import { AnimeStreamService } from "@/features/anime/stream/anime-stream-service.ts";
import { CatalogRssService } from "@/features/operations/catalog/catalog-rss-service.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog/catalog-library-read-service.ts";
import {
  ListAnimeQuerySchema,
  SearchAnimeQuerySchema,
  SeasonalAnimeQuerySchema,
  StreamUrlQuerySchema,
} from "@/http/anime/request-schemas.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQuery,
  jsonResponse,
} from "@/http/shared/router-helpers.ts";

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
    "/anime/seasonal",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SeasonalAnimeQuerySchema);
        return yield* (yield* AnimeQueryService).listSeasonalAnime(query);
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
        return yield* (yield* CatalogRssService).listAnimeRssFeeds(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rename-preview",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryReadService).getRenamePreview(params.id);
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
        return yield* (yield* AnimeStreamService).createEpisodeStreamUrl(
          params.id,
          query.episodeNumber,
        );
      }),
      jsonResponse,
    ),
  ),
);
