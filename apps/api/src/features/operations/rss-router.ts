import * as HttpRouter from "effect/unstable/http/HttpRouter";
import { Effect, Layer, Schema } from "effect";
import { RssFeedSchema } from "@packages/shared/index.ts";

import { CatalogRssService } from "@/features/operations/catalog/catalog-rss-service.ts";
import { AddRssFeedBodySchema, EnabledBodySchema } from "@/features/operations/request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  schemaJsonResponse,
  successResponse,
} from "@/infra/http/router-helpers.ts";
import { IdParamsSchema } from "@/infra/http/common-request-schemas.ts";

export const rssRouter = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/rss",
    authedRouteResponse(
      Effect.flatMap(CatalogRssService, (service) => service.listRssFeeds()),
      schemaJsonResponse(Schema.Array(RssFeedSchema)),
    ),
  ),
  HttpRouter.add(
    "POST",
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
  HttpRouter.add(
    "DELETE",
    "/rss/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogRssService).deleteRssFeed(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.add(
    "PUT",
    "/rss/:id/toggle",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(EnabledBodySchema, "toggle RSS feed");
        yield* (yield* CatalogRssService).setRssFeedEnabled(params.id, body.enabled);
      }),
      successResponse,
    ),
  ),
);
