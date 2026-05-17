import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeFileService } from "@/features/media/files/media-file-service.ts";
import { AnimeQueryService } from "@/features/media/query/query-service.ts";
import { AnimeStreamService } from "@/features/media/stream/media-stream-service.ts";
import { CatalogRssService } from "@/features/operations/catalog/catalog-rss-service.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog/catalog-library-read-service.ts";
import {
  ListMediaQuerySchema,
  SearchMediaQuerySchema,
  SeasonalMediaQuerySchema,
  StreamUrlQuerySchema,
} from "@/http/media/request-schemas.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQuery,
  jsonResponse,
} from "@/http/shared/router-helpers.ts";

export const animeReadRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/media",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(ListMediaQuerySchema);
        return yield* (yield* AnimeQueryService).listMedia({
          limit: query.limit,
          monitored: query.monitored,
          offset: query.offset,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/seasonal",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SeasonalMediaQuerySchema);
        return yield* (yield* AnimeQueryService).listSeasonalAnime(query);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/search",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SearchMediaQuerySchema);
        return yield* (yield* AnimeQueryService).searchAnime(query.q ?? "", query.media_kind);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/anilist/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQuery(SearchMediaQuerySchema);
        return yield* (yield* AnimeQueryService).getAnimeByAnilistId(params.id, query.media_kind);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).getMedia(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id/units",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).listEpisodes(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id/files",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeFileService).listFiles(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogRssService).listAnimeRssFeeds(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id/rename-preview",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryReadService).getRenamePreview(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/media/:id/stream-url",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQuery(StreamUrlQuerySchema);
        return yield* (yield* AnimeStreamService).createStreamUrl(params.id, query.unitNumber);
      }),
      jsonResponse,
    ),
  ),
);
