import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { DownloadTriggerService } from "@/features/operations/download-trigger-service.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog-library-read-service.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import { OperationsTaskLauncherService } from "@/features/operations/operations-task-launcher-service.ts";
import { SearchEpisodeService } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseService } from "@/features/operations/search-orchestration-release-search.ts";
import {
  CalendarQuerySchema,
  SearchDownloadBodySchema,
  SearchMissingBodySchema,
  SearchReleasesQuerySchema,
  WantedMissingQuerySchema,
} from "@/http/operations/request-schemas.ts";
import {
  acceptedResponse,
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodeOptionalJsonBodyWithLabel,
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";
import { SearchEpisodeParamsSchema } from "@/http/shared/common-request-schemas.ts";

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
        return yield* (yield* CatalogLibraryReadService).getCalendarWithDefaults({
          ...(query.end === undefined ? {} : { end: query.end }),
          ...(query.start === undefined ? {} : { start: query.start }),
        });
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
        yield* (yield* DownloadTriggerService).triggerDownload({
          anime_id: body.anime_id,
          ...(body.episode_number === undefined ? {} : { episode_number: body.episode_number }),
          ...(body.is_batch === undefined ? {} : { is_batch: body.is_batch }),
          magnet: body.magnet,
          ...(body.release_context === undefined ? {} : { release_context: body.release_context }),
          title: body.title,
        });
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
          new SearchMissingBodySchema({}),
        );
        const searchBackgroundMissingService = yield* SearchBackgroundMissingService;
        return yield* (yield* OperationsTaskLauncherService).launch({
          ...(body.anime_id === undefined ? {} : { animeId: body.anime_id }),
          failureMessage:
            body.anime_id === undefined
              ? "Missing-episode search failed"
              : `Missing-episode search failed for anime ${body.anime_id}`,
          operation: () => searchBackgroundMissingService.triggerSearchMissing(body.anime_id),
          queuedMessage:
            body.anime_id === undefined
              ? "Queued missing-episode search for monitored anime"
              : `Queued missing-episode search for anime ${body.anime_id}`,
          runningMessage:
            body.anime_id === undefined
              ? "Searching missing episodes for monitored anime"
              : `Searching missing episodes for anime ${body.anime_id}`,
          successMessage: () =>
            body.anime_id === undefined
              ? "Finished missing-episode search for monitored anime"
              : `Finished missing-episode search for anime ${body.anime_id}`,
          taskKey: "downloads_search_missing_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
);
