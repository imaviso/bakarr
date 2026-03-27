import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { ClockService } from "../lib/clock.ts";
import {
  CatalogOrchestration,
  DownloadOrchestration,
  SearchOrchestration,
} from "../features/operations/operations-orchestration.ts";
import {
  CalendarQuerySchema,
  SearchDownloadBodySchema,
  SearchMissingBodySchema,
  SearchReleasesQuerySchema,
  WantedMissingQuerySchema,
} from "./operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodeOptionalJsonBody,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "./router-helpers.ts";
import { SearchEpisodeParamsSchema } from "./common-request-schemas.ts";

export const searchRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/wanted/missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(WantedMissingQuerySchema, "wanted missing");
        return yield* (yield* CatalogOrchestration).getWantedMissing(query.limit ?? 50);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/calendar",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(CalendarQuerySchema, "calendar");
        const now = yield* (yield* ClockService).currentTimeMillis;
        const nowIso = new Date(now).toISOString();
        return yield* (yield* CatalogOrchestration).getCalendar(
          query.start ?? nowIso,
          query.end ?? nowIso,
        );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/search/releases",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(SearchReleasesQuerySchema, "search releases");
        return yield* (yield* SearchOrchestration).searchReleases(
          query.query ?? "",
          query.anime_id,
          query.category,
          query.filter,
        );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/search/episode/:animeId/:episodeNumber",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(SearchEpisodeParamsSchema);
        return yield* (yield* SearchOrchestration).searchEpisode(
          params.animeId,
          params.episodeNumber,
        );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/search/download",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(SearchDownloadBodySchema, "search download");
        yield* (yield* DownloadOrchestration).triggerDownload(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/search-missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeOptionalJsonBody({
          empty: new SearchMissingBodySchema({ anime_id: undefined }),
          label: "search missing downloads",
          schema: SearchMissingBodySchema,
        });
        yield* (yield* SearchOrchestration).triggerSearchMissing(body.anime_id);
      }),
      successResponse,
    ),
  ),
);
