import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";
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
import { RssFeedRepository } from "@/features/operations/repository/rss-feed-repository.ts";
import {
  ListMediaQuerySchema,
  MediaUnitPageParamsSchema,
  MediaUnitParamsSchema,
  SearchMediaQuerySchema,
  SeasonalMediaQuerySchema,
  StreamUrlQuerySchema,
} from "@/http/media/request-schemas.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQuery,
  schemaJsonResponse,
} from "@/http/shared/router-helpers.ts";

const StreamUrlResponseSchema = Schema.Struct({ url: Schema.String });

export const mediaReadRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
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
  HttpRouter.get(
    "/media/seasonal",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SeasonalMediaQuerySchema);
        return yield* (yield* MediaQueryService).listSeasonalMedia(query);
      }),
      schemaJsonResponse(SeasonalMediaResponseSchema),
    ),
  ),
  HttpRouter.get(
    "/media/search",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SearchMediaQuerySchema);
        return yield* (yield* MediaQueryService).searchMedia(query.q ?? "", query.media_kind);
      }),
      schemaJsonResponse(MediaSearchResponseSchema),
    ),
  ),
  HttpRouter.get(
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
  HttpRouter.get(
    "/media/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaQueryService).getMedia(params.id);
      }),
      schemaJsonResponse(MediaSchema),
    ),
  ),
  HttpRouter.get(
    "/media/:id/units",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaQueryService).listEpisodes(params.id);
      }),
      schemaJsonResponse(Schema.Array(MediaUnitSchema)),
    ),
  ),
  HttpRouter.get(
    "/media/:id/units/:unitNumber/pages",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(MediaUnitParamsSchema);
        return yield* (yield* MediaReaderService).listPages(params.id, params.unitNumber);
      }),
      schemaJsonResponse(ReaderPagesResponseSchema),
    ),
  ),
  HttpRouter.get(
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
              "Content-Disposition": inlineImageContentDisposition(page.fileName),
            },
          }),
        ),
    ),
  ),
  HttpRouter.get(
    "/media/:id/files",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* MediaFileService).listFiles(params.id);
      }),
      schemaJsonResponse(Schema.Array(VideoFileSchema)),
    ),
  ),
  HttpRouter.get(
    "/media/:id/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* RssFeedRepository).listByMediaId(params.id);
      }),
      schemaJsonResponse(Schema.Array(RssFeedSchema)),
    ),
  ),
  HttpRouter.get(
    "/media/:id/rename-preview",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryReadService).getRenamePreview(params.id);
      }),
      schemaJsonResponse(Schema.Array(RenamePreviewItemSchema)),
    ),
  ),
  HttpRouter.get(
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

function inlineImageContentDisposition(fileName: string) {
  const asciiOnly = fileName.replace(/[^\x20-\x7E]/g, "_");
  const sanitized = asciiOnly.replace(/[\r\n]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
