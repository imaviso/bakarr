import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeFileService } from "@/features/anime/anime-file-service.ts";
import { AnimeEnrollmentService } from "@/features/anime/anime-enrollment-service.ts";
import { AnimeMaintenanceService } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeSettingsService } from "@/features/anime/anime-settings-service.ts";
import { CatalogLibraryWriteService } from "@/features/operations/catalog-orchestration-library-write-support.ts";
import {
  AddAnimeInputSchema,
  AnimeEpisodeParamsSchema,
  BulkEpisodeMappingsBodySchema,
  FilePathBodySchema,
  MonitoredBodySchema,
  PathBodySchema,
  ProfileNameBodySchema,
  ReleaseProfileIdsBodySchema,
} from "@/http/anime-request-schemas.ts";
import { IdParamsSchema } from "@/http/common-request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  jsonResponse,
  successResponse,
} from "@/http/router-helpers.ts";

export const animeWriteRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/anime",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(AddAnimeInputSchema, "add anime");
        return yield* (yield* AnimeEnrollmentService).enroll(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/anime/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* AnimeMaintenanceService).deleteAnime(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/monitor",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(MonitoredBodySchema, "update monitored status");
        yield* (yield* AnimeSettingsService).setMonitored(params.id, body.monitored);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/path",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(PathBodySchema, "update anime path");
        yield* (yield* AnimeSettingsService).updatePath(params.id, body.path);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/profile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(ProfileNameBodySchema, "update anime profile");
        yield* (yield* AnimeSettingsService).updateProfile(params.id, body.profile_name);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/release-profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(
          ReleaseProfileIdsBodySchema,
          "update release profiles",
        );
        yield* (yield* AnimeSettingsService).updateReleaseProfiles(params.id, [
          ...body.release_profile_ids,
        ]);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/refresh",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* AnimeMaintenanceService).refreshEpisodes(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/scan",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeFileService).scanFolder(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/anime/:id/episodes/:episodeNumber/file",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        yield* (yield* AnimeFileService).deleteEpisodeFile(params.id, params.episodeNumber);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/:episodeNumber/map",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(FilePathBodySchema, "map episode file");
        yield* (yield* AnimeFileService).mapEpisodeFile(
          params.id,
          params.episodeNumber,
          body.file_path,
        );
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/map/bulk",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(
          BulkEpisodeMappingsBodySchema,
          "bulk map episodes",
        );
        yield* (yield* AnimeFileService).bulkMapEpisodeFiles(params.id, [...body.mappings]);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/rename",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryWriteService).renameFiles(params.id);
      }),
      jsonResponse,
    ),
  ),
);
