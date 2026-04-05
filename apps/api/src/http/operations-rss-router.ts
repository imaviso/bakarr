import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { CatalogRssService } from "@/features/operations/catalog-rss-service.ts";
import { AddRssFeedBodySchema, EnabledBodySchema } from "@/http/operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  jsonResponse,
  successResponse,
} from "@/http/router-helpers.ts";
import { IdParamsSchema } from "@/http/common-request-schemas.ts";

export const rssRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/rss",
    authedRouteResponse(
      Effect.flatMap(CatalogRssService, (service) => service.listRssFeeds()),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddRssFeedBodySchema, "add RSS feed");
        return yield* (yield* CatalogRssService).addRssFeed({
          anime_id: body.anime_id,
          ...(body.name === undefined ? {} : { name: body.name }),
          url: body.url,
        });
      }),
      jsonResponse,
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
