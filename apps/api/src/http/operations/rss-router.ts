import { HttpRouter } from "@effect/platform";
import { Effect, Schema } from "effect";
import { RssFeedSchema } from "@packages/shared/index.ts";

import { CatalogRssService } from "@/features/operations/catalog/catalog-rss-service.ts";
import { AddRssFeedBodySchema, EnabledBodySchema } from "@/http/operations/request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";

export const rssRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/rss",
    authedRouteResponse(
      Effect.flatMap(CatalogRssService, (service) => service.listRssFeeds()),
      schemaJsonResponse(Schema.Array(RssFeedSchema)),
    ),
  ),
  HttpRouter.post(
    "/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddRssFeedBodySchema, "add RSS feed");
        return yield* (yield* CatalogRssService).addRssFeed({
          media_id: body.media_id,
          ...(body.name === undefined ? {} : { name: body.name }),
          url: body.url,
        });
      }),
      schemaJsonResponse(RssFeedSchema),
    ),
  ),
  HttpRouter.del(
    "/rss/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogRssService).deleteRssFeed(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/rss/:id/toggle",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(EnabledBodySchema, "toggle RSS feed");
        yield* (yield* CatalogRssService).toggleRssFeed(params.id, body.enabled);
      }),
      successResponse,
    ),
  ),
);
