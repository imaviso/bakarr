import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { DownloadTriggerService } from "@/features/operations/download/download-trigger-service.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog/catalog-library-read-service.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-support.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { SearchUnitService } from "@/features/operations/search/search-orchestration-unit-support.ts";
import { SearchReleaseService } from "@/features/operations/search/search-orchestration-release-search.ts";
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
import { SearchUnitParamsSchema } from "@/http/shared/common-request-schemas.ts";

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
          query.media_id,
          query.category,
          query.filter,
        );
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/search/units/:mediaId/:unitNumber",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(SearchUnitParamsSchema);
        return yield* (yield* SearchUnitService).searchUnit(params.mediaId, params.unitNumber);
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
          media_id: body.media_id,
          ...(body.unit_number === undefined ? {} : { unit_number: body.unit_number }),
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
          ...(body.media_id === undefined ? {} : { mediaId: body.media_id }),
          failureMessage:
            body.media_id === undefined
              ? "Missing-unit search failed"
              : `Missing-unit search failed for media ${body.media_id}`,
          operation: () => searchBackgroundMissingService.triggerSearchMissing(body.media_id),
          queuedMessage:
            body.media_id === undefined
              ? "Queued missing-unit search for monitored media"
              : `Queued missing-unit search for media ${body.media_id}`,
          runningMessage:
            body.media_id === undefined
              ? "Searching missing mediaUnits for monitored media"
              : `Searching missing mediaUnits for media ${body.media_id}`,
          successMessage: () =>
            body.media_id === undefined
              ? "Finished missing-unit search for monitored media"
              : `Finished missing-unit search for media ${body.media_id}`,
          taskKey: "downloads_search_missing_manual",
        });
      }),
      acceptedResponse,
    ),
  ),
);
