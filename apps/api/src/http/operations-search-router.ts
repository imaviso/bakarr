import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { ClockService } from "@/lib/clock.ts";
import { DownloadTriggerService } from "@/features/operations/download-trigger-service.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog-library-read-service.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import { SearchEpisodeService } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseService } from "@/features/operations/search-orchestration-release-search.ts";
import {
  CalendarQuerySchema,
  SearchDownloadBodySchema,
  SearchMissingBodySchema,
  SearchReleasesQuerySchema,
  WantedMissingQuerySchema,
} from "@/http/operations-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodeOptionalJsonBodyWithLabel,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/router-helpers.ts";
import { SearchEpisodeParamsSchema } from "@/http/common-request-schemas.ts";

export const searchRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/wanted/missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(WantedMissingQuerySchema, "wanted missing");
        return yield* (yield* CatalogLibraryReadService).getWantedMissing(query.limit ?? 50);
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
        return yield* (yield* CatalogLibraryReadService).getCalendar(
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
        return yield* (yield* SearchReleaseService).searchReleases(
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
        return yield* (yield* SearchEpisodeService).searchEpisode(
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
        yield* (yield* DownloadTriggerService).triggerDownload(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/search-missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeOptionalJsonBodyWithLabel(
          SearchMissingBodySchema,
          "search missing downloads",
          new SearchMissingBodySchema({ anime_id: undefined }),
        );
        yield* (yield* SearchBackgroundMissingService).triggerSearchMissing(body.anime_id);
      }),
      successResponse,
    ),
  ),
);
