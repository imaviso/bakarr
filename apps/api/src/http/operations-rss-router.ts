import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { CatalogWorkflow } from "../features/operations/catalog-service-tags.ts";
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
      Effect.flatMap(CatalogWorkflow, (service) => service.listRssFeeds()),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddRssFeedBodySchema, "add RSS feed");
        return yield* (yield* CatalogWorkflow).addRssFeed(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/rss/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* CatalogWorkflow).deleteRssFeed(params.id);
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
        yield* (yield* CatalogWorkflow).toggleRssFeed(params.id, body.enabled);
      }),
      successResponse,
    ),
  ),
);
