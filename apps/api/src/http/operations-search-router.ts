import { HttpRouter, HttpServerRequest } from "@effect/platform";
import { Effect, Schema } from "effect";

import { ClockService } from "@/lib/clock.ts";
import { CatalogLibraryService } from "@/features/operations/catalog-library-service.ts";
import { DownloadWorkflow } from "@/features/operations/download-service-tags.ts";
import { SearchBackgroundService } from "@/features/operations/search-background-service.ts";
import { SearchEpisodeService } from "@/features/operations/search-episode-service.ts";
import { SearchReleaseService } from "@/features/operations/search-release-service.ts";
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
  decodePathParams,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/router-helpers.ts";
import { SearchEpisodeParamsSchema } from "@/http/common-request-schemas.ts";
import { formatValidationErrorMessage, RequestValidationError } from "@/http/route-validation.ts";

export const searchRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/wanted/missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(WantedMissingQuerySchema, "wanted missing");
        return yield* (yield* CatalogLibraryService).getWantedMissing(query.limit ?? 50);
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
        return yield* (yield* CatalogLibraryService).getCalendar(
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
        yield* (yield* DownloadWorkflow).triggerDownload(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/downloads/search-missing",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const text = yield* request.text;

          if (text.trim().length === 0) {
            return new SearchMissingBodySchema({ anime_id: undefined });
          }

          return yield* Schema.decode(Schema.parseJson(SearchMissingBodySchema))(text).pipe(
            Effect.mapError((error) =>
              RequestValidationError.make({
                message: formatValidationErrorMessage(
                  "Invalid request body for search missing downloads",
                  error,
                ),
                status: 400,
              }),
            ),
          );
        });
        yield* (yield* SearchBackgroundService).triggerSearchMissing(body.anime_id);
      }),
      successResponse,
    ),
  ),
);
