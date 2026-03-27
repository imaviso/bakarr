import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import {
  AnimeFileService,
  AnimeMutationService,
  AnimeQueryService,
} from "../features/anime/service.ts";
import { AnimeEnrollmentService } from "../features/anime/anime-enrollment-service.ts";
import { CatalogOrchestration } from "../features/operations/operations-orchestration.ts";
import {
  AddAnimeInputSchema,
  AnimeEpisodeParamsSchema,
  BulkEpisodeMappingsBodySchema,
  FilePathBodySchema,
  ListAnimeQuerySchema,
  MonitoredBodySchema,
  PathBodySchema,
  ProfileNameBodySchema,
  ReleaseProfileIdsBodySchema,
  SearchAnimeQuerySchema,
  StreamUrlQuerySchema,
} from "./anime-request-schemas.ts";
import { IdParamsSchema } from "./common-request-schemas.ts";
import { buildAnimeStreamResponse, buildAnimeStreamUrl } from "./anime-streaming.ts";
import {
  decodeJsonBody,
  decodePathParams,
  decodeQuery,
  authedRouteResponse,
  jsonResponse,
  routeResponse,
  successResponse,
} from "./router-helpers.ts";

const animeReadRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/anime",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(ListAnimeQuerySchema);
        return yield* (yield* AnimeQueryService).listAnime({
          limit: query.limit,
          monitored: query.monitored,
          offset: query.offset,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/search",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SearchAnimeQuerySchema);
        return yield* (yield* AnimeQueryService).searchAnime(query.q ?? "");
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/anilist/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).getAnimeByAnilistId(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).getAnime(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/episodes",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).listEpisodes(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/files",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeFileService).listFiles(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogOrchestration).listAnimeRssFeeds(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rename-preview",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogOrchestration).getRenamePreview(params.id);
      }),
      jsonResponse,
    ),
  ),
);

const animeWriteRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/anime",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBody(AddAnimeInputSchema);
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
        yield* (yield* AnimeMutationService).deleteAnime(params.id);
      }),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/monitor",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBody(MonitoredBodySchema);
        yield* (yield* AnimeMutationService).setMonitored(params.id, body.monitored);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/path",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBody(PathBodySchema);
        yield* (yield* AnimeMutationService).updatePath(params.id, body.path);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/profile",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBody(ProfileNameBodySchema);
        yield* (yield* AnimeMutationService).updateProfile(params.id, body.profile_name);
      }),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/release-profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBody(ReleaseProfileIdsBodySchema);
        yield* (yield* AnimeMutationService).updateReleaseProfiles(params.id, [
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
        yield* (yield* AnimeMutationService).refreshEpisodes(params.id);
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
        const body = yield* decodeJsonBody(FilePathBodySchema);
        yield* (yield* AnimeFileService).mapEpisode(
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
        const body = yield* decodeJsonBody(BulkEpisodeMappingsBodySchema);
        yield* (yield* AnimeFileService).bulkMapEpisodes(params.id, [...body.mappings]);
      }),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/stream-url",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQuery(StreamUrlQuerySchema);
        return yield* buildAnimeStreamUrl({
          animeId: params.id,
          episodeNumber: query.episodeNumber,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/rename",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogOrchestration).renameFiles(params.id);
      }),
      jsonResponse,
    ),
  ),
);

const animeStreamRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/stream/:id/:episodeNumber",
    routeResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        return yield* buildAnimeStreamResponse({
          animeId: params.id,
          episodeNumber: params.episodeNumber,
        });
      }),
      Effect.succeed,
    ),
  ),
);

export const animeRouter = HttpRouter.concatAll(
  animeReadRouter,
  animeWriteRouter,
  animeStreamRouter,
);
