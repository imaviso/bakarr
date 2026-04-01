import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { Database } from "@/db/database.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { AnimeEnrollmentService } from "@/features/anime/anime-enrollment-service.ts";
import { AnimeMaintenanceService } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeSettingsService } from "@/features/anime/anime-settings-service.ts";
import { scanAnimeFolderOrchestrationEffect } from "@/features/anime/anime-folder-scan-orchestration.ts";
import {
  deleteEpisodeFileEffect,
  mapEpisodeFileEffect,
  bulkMapEpisodeFilesEffect,
} from "@/features/anime/anime-file-write.ts";
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
        const { db } = yield* Database;
        const eventPublisher = yield* EventPublisher;
        const fs = yield* FileSystem;
        const mediaProbe = yield* MediaProbe;
        const clock = yield* ClockService;
        return yield* scanAnimeFolderOrchestrationEffect({
          animeId: params.id,
          db,
          eventPublisher,
          fs,
          mediaProbe,
          nowIso: () => nowIsoFromClock(clock),
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/anime/:id/episodes/:episodeNumber/file",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        const { db } = yield* Database;
        const fs = yield* FileSystem;
        yield* deleteEpisodeFileEffect({
          animeId: params.id,
          db,
          episodeNumber: params.episodeNumber,
          fs,
        });
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
        const { db } = yield* Database;
        const fs = yield* FileSystem;
        yield* mapEpisodeFileEffect({
          animeId: params.id,
          db,
          episodeNumber: params.episodeNumber,
          filePath: body.file_path,
          fs,
        });
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
        const { db } = yield* Database;
        const fs = yield* FileSystem;
        yield* bulkMapEpisodeFilesEffect({
          animeId: params.id,
          db,
          fs,
          mappings: [...body.mappings],
        });
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
