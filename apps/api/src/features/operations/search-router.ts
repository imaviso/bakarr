import { HttpRouter } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  AsyncOperationAcceptedSchema,
  CalendarEventSchema,
  MissingUnitSchema,
  SearchResultsSchema,
  UnitSearchResultSchema,
} from "@packages/shared/index.ts";

import { DownloadTriggerService } from "@/features/operations/download/download-trigger-service.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-service.ts";
import { SearchUnitService } from "@/features/operations/search/search-unit-service.ts";
import { SearchReleaseService } from "@/features/operations/search/search-orchestration-release-search.ts";
import { MediaQueryService } from "@/features/media/query/query-service.ts";
import {
  CalendarQuerySchema,
  SearchDownloadBodySchema,
  SearchMissingBodySchema,
  SearchReleasesQuerySchema,
  WantedMissingQuerySchema,
} from "@/features/operations/request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodeOptionalJsonBodyWithLabel,
  decodePathParams,
  decodeQueryWithLabel,
  schemaAcceptedResponse,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";
import { SearchUnitParamsSchema } from "@/http/shared/common-request-schemas.ts";

const acceptedOperationResponse = schemaAcceptedResponse(AsyncOperationAcceptedSchema);

export const searchRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/wanted/missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(WantedMissingQuerySchema, "wanted missing");
        return yield* (yield* MediaQueryService).listWantedMissing(query.limit ?? 50);
      }),
      schemaJsonResponse(Schema.Array(MissingUnitSchema)),
    ),
  ),
  HttpRouter.get(
    "/calendar",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(CalendarQuerySchema, "calendar");
        return yield* (yield* MediaQueryService).listCalendarEvents(query.start, query.end);
      }),
      schemaJsonResponse(Schema.Array(CalendarEventSchema)),
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
      schemaJsonResponse(SearchResultsSchema),
    ),
  ),
  HttpRouter.get(
    "/search/units/:mediaId/:unitNumber",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(SearchUnitParamsSchema);
        return yield* (yield* SearchUnitService).searchUnit(params.mediaId, params.unitNumber);
      }),
      schemaJsonResponse(Schema.Array(UnitSearchResultSchema)),
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
        return yield* (yield* SearchBackgroundMissingService).startMissingUnitSearch(body.media_id);
      }),
      acceptedOperationResponse,
    ),
  ),
);
