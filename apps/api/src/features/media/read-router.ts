import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Effect, Layer, Schema } from "effect";
import {
  MediaListResponseSchema,
  MediaSchema,
  MediaSearchResponseSchema,
  MediaSearchResultSchema,
  MediaUnitSchema,
  ReaderPagesResponseSchema,
  RenamePreviewItemSchema,
  RssFeedSchema,
  SeasonalMediaResponseSchema,
  VideoFileSchema,
} from "@packages/shared/index.ts";

import { MediaFileService } from "@/features/media/files/media-file-service.ts";
import { MediaQueryService } from "@/features/media/query/query-service.ts";
import { MediaStreamService } from "@/features/media/stream/media-stream-service.ts";
import { MediaReaderService } from "@/features/media/reader/media-reader-service.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog/catalog-library-read-service.ts";
import { CatalogRssService } from "@/features/operations/catalog/catalog-rss-service.ts";
import {
  ListMediaQuerySchema,
  MediaUnitPageParamsSchema,
  MediaUnitParamsSchema,
  SearchMediaQuerySchema,
  SeasonalMediaQuerySchema,
  StreamUrlQuerySchema,
} from "@/features/media/request-schemas.ts";
import { IdParamsSchema } from "@/infra/http/common-request-schemas.ts";
import { inlineContentDisposition } from "@/infra/http/route-fs.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQuery,
  schemaJsonResponse,
} from "@/infra/http/router-helpers.ts";

const StreamUrlResponseSchema = Schema.Struct({ url: Schema.String });

export const mediaReadRouter = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/media",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(ListMediaQuerySchema);
        return yield* (yield* MediaQueryService).listMedia({
          limit: query.limit,
          monitored: query.monitored,
          offset: query.offset,
        });
      }),
      schemaJsonResponse(MediaListResponseSchema),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/seasonal",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SeasonalMediaQuerySchema);
        return yield* (yield* MediaQueryService).listSeasonalMedia(query);
      }),
      schemaJsonResponse(SeasonalMediaResponseSchema),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/search",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SearchMediaQuerySchema);
        return yield* (yield* MediaQueryService).searchMedia(query.q ?? "", query.media_kind);
      }),
      schemaJsonResponse(MediaSearchResponseSchema),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/anilist/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQuery(SearchMediaQuerySchema);
        return yield* (yield* MediaQueryService).getMediaByAnilistId(params.id, query.media_kind);
      }),
      schemaJsonResponse(MediaSearchResultSchema),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaQueryService).getMedia(params.id);
      }),
      schemaJsonResponse(MediaSchema),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id/units",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaQueryService).listUnits(params.id);
      }),
      schemaJsonResponse(Schema.Array(MediaUnitSchema)),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id/units/:unitNumber/pages",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaUnitParamsSchema);
        return yield* (yield* MediaReaderService).listPages(params.id, params.unitNumber);
      }),
      schemaJsonResponse(ReaderPagesResponseSchema),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id/units/:unitNumber/pages/:pageNumber/image",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaUnitPageParamsSchema);
        return yield* (yield* MediaReaderService).readPageImage(
          params.id,
          params.unitNumber,
          params.pageNumber,
        );
      }),
      (page) =>
        Effect.succeed(
          HttpServerResponse.uint8Array(page.bytes, {
            contentType: page.mediaType,
            headers: {
              "Cache-Control": "private, max-age=86400",
              "Content-Disposition": inlineContentDisposition(page.fileName),
            },
          }),
        ),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id/files",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaFileService).listFiles(params.id);
      }),
      schemaJsonResponse(Schema.Array(VideoFileSchema)),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogRssService).listRssFeedsByMediaId(params.id);
      }),
      schemaJsonResponse(Schema.Array(RssFeedSchema)),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id/rename-preview",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryReadService).getRenamePreview(params.id);
      }),
      schemaJsonResponse(Schema.Array(RenamePreviewItemSchema)),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/media/:id/stream-url",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQuery(StreamUrlQuerySchema);
        return yield* (yield* MediaStreamService).createStreamUrl(params.id, query.unitNumber);
      }),
      schemaJsonResponse(StreamUrlResponseSchema),
    ),
  ),
);
