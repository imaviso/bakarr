import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

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
          ...(body.decision_reason === undefined ? {} : { decision_reason: body.decision_reason }),
          ...(body.episode_number === undefined ? {} : { episode_number: body.episode_number }),
          ...(body.group === undefined ? {} : { group: body.group }),
          ...(body.info_hash === undefined ? {} : { info_hash: body.info_hash }),
          ...(body.is_batch === undefined ? {} : { is_batch: body.is_batch }),
          magnet: body.magnet,
          ...(body.release_metadata === undefined
            ? {}
            : { release_metadata: body.release_metadata }),
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
        yield* (yield* SearchBackgroundMissingService).triggerSearchMissing(body.anime_id);
      }),
      successResponse,
    ),
  ),
);
