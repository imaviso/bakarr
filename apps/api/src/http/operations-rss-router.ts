import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { CatalogDownloadService } from "../features/operations/catalog-service-tags.ts";
import { AddRssFeedBodySchema, EnabledBodySchema } from "./operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  jsonResponse,
  successResponse,
} from "./router-helpers.ts";
import { IdParamsSchema } from "./common-request-schemas.ts";

export const rssRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/rss",
    authedRouteResponse(
      Effect.flatMap(CatalogDownloadService, (service) => service.listRssFeeds()),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddRssFeedBodySchema, "add RSS feed");
        return yield* (yield* CatalogDownloadService).addRssFeed(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/rss/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogDownloadService).deleteRssFeed(params.id);
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
        yield* (yield* CatalogDownloadService).toggleRssFeed(params.id, body.enabled);
      }),
      successResponse,
    ),
  ),
);
