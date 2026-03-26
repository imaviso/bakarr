import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";

import { AnimeService } from "../features/anime/service.ts";
import { AuthError } from "../features/auth/service.ts";
import { DownloadService, LibraryService, RssService } from "../features/operations/service.ts";
import { ClockService } from "../lib/clock.ts";
import { FileSystem } from "../lib/filesystem.ts";
import { createFileChunkStream, type FileByteRange } from "./file-stream.ts";
import {
  AddAnimeInputSchema,
  AnimeEpisodeParamsSchema,
  BulkEpisodeMappingsBodySchema,
  FilePathBodySchema,
  IdParamsSchema,
  ListAnimeQuerySchema,
  MonitoredBodySchema,
  PathBodySchema,
  ProfileNameBodySchema,
  ReleaseProfileIdsBodySchema,
  SearchAnimeQuerySchema,
} from "./request-schemas.ts";
import {
  decodeJsonBody,
  decodePathParams,
  decodeQuery,
  jsonResponse,
  routeResponse,
  successResponse,
} from "./router-helpers.ts";
import { requireViewerFromHttpRequest } from "./route-auth.ts";
import { EpisodeStreamRangeError } from "./streaming-errors.ts";
import { StreamTokenSigner } from "./stream-token-signer.ts";
import { guessContentType } from "./route-fs.ts";

class StreamQuerySchema extends Schema.Class<StreamQuerySchema>("StreamQuerySchema")({
  exp: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  sig: Schema.String.pipe(Schema.minLength(1)),
}) {}

class StreamUrlQuerySchema extends Schema.Class<StreamUrlQuerySchema>("StreamUrlQuerySchema")({
  episodeNumber: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
}) {}

/** Duration of a signed stream URL in milliseconds (6 hours). */
const STREAM_EXPIRY_MS = 6 * 60 * 60 * 1000;

const animeReadRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/anime",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(ListAnimeQuerySchema);
          return yield* Effect.flatMap(AnimeService, (service) =>
            service.listAnime({
              limit: query.limit,
              monitored: query.monitored,
              offset: query.offset,
            }),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/search",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const query = yield* decodeQuery(SearchAnimeQuerySchema);
          return yield* Effect.flatMap(AnimeService, (service) =>
            service.searchAnime(query.q ?? ""),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/anilist/:id",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(AnimeService, (service) =>
            service.getAnimeByAnilistId(params.id),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(AnimeService, (service) => service.getAnime(params.id));
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/episodes",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(AnimeService, (service) => service.listEpisodes(params.id));
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/files",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(AnimeService, (service) => service.listFiles(params.id));
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rss",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(RssService, (service) =>
            service.listAnimeRssFeeds(params.id),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rename-preview",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(LibraryService, (service) =>
            service.getRenamePreview(params.id),
          );
        }),
      ),
      jsonResponse,
    ),
  ),
);

const animeWriteRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/anime",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(AddAnimeInputSchema);
          const anime = yield* Effect.flatMap(AnimeService, (service) => service.addAnime(body));

          if (body.monitor_and_search) {
            yield* Effect.flatMap(DownloadService, (service) =>
              service.triggerSearchMissing(anime.id),
            );
          }

          return anime;
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/anime/:id",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* Effect.flatMap(AnimeService, (service) => service.deleteAnime(params.id));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/monitor",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const body = yield* decodeJsonBody(MonitoredBodySchema);
          yield* Effect.flatMap(AnimeService, (service) =>
            service.setMonitored(params.id, body.monitored),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/path",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const body = yield* decodeJsonBody(PathBodySchema);
          yield* Effect.flatMap(AnimeService, (service) =>
            service.updatePath(params.id, body.path),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/profile",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const body = yield* decodeJsonBody(ProfileNameBodySchema);
          yield* Effect.flatMap(AnimeService, (service) =>
            service.updateProfile(params.id, body.profile_name),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.put(
    "/anime/:id/release-profiles",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const body = yield* decodeJsonBody(ReleaseProfileIdsBodySchema);
          yield* Effect.flatMap(AnimeService, (service) =>
            service.updateReleaseProfiles(params.id, [...body.release_profile_ids]),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/refresh",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* Effect.flatMap(AnimeService, (service) => service.refreshEpisodes(params.id));
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/scan",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(AnimeService, (service) => service.scanFolder(params.id));
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/anime/:id/episodes/:episodeNumber/file",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
          yield* Effect.flatMap(AnimeService, (service) =>
            service.deleteEpisodeFile(params.id, params.episodeNumber),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/:episodeNumber/map",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
          const body = yield* decodeJsonBody(FilePathBodySchema);
          yield* Effect.flatMap(AnimeService, (service) =>
            service.mapEpisode(params.id, params.episodeNumber, body.file_path),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/episodes/map/bulk",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const body = yield* decodeJsonBody(BulkEpisodeMappingsBodySchema);
          yield* Effect.flatMap(AnimeService, (service) =>
            service.bulkMapEpisodes(params.id, [...body.mappings]),
          );
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/stream-url",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const query = yield* decodeQuery(StreamUrlQuerySchema);
          const expiresAt = yield* Effect.flatMap(ClockService, (clock) =>
            Effect.map(clock.currentTimeMillis, (now) => now + STREAM_EXPIRY_MS),
          );
          const signature = yield* Effect.flatMap(StreamTokenSigner, (signer) =>
            signer.sign({
              animeId: params.id,
              episodeNumber: query.episodeNumber,
              expiresAt,
            }),
          ).pipe(
            Effect.mapError(
              () =>
                new AuthError({
                  message: "Failed to sign stream URL",
                  status: 400,
                }),
            ),
          );
          const url = `/api/stream/${params.id}/${query.episodeNumber}?exp=${expiresAt}&sig=${signature}`;
          return { url };
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/anime/:id/rename",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          return yield* Effect.flatMap(LibraryService, (service) => service.renameFiles(params.id));
        }),
      ),
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
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://bakarr.local");
        const query = yield* Schema.decodeUnknown(StreamQuerySchema)({
          exp: url.searchParams.get("exp") ?? "",
          sig: url.searchParams.get("sig") ?? "",
        }).pipe(
          Effect.mapError(
            () =>
              new AuthError({
                message: "Forbidden or expired",
                status: 403,
              }),
          ),
        );
        const nowMillis = yield* Effect.flatMap(ClockService, (clock) => clock.currentTimeMillis);
        const isAuthorized = yield* Effect.flatMap(StreamTokenSigner, (signer) =>
          signer.verify({
            animeId: params.id,
            episodeNumber: params.episodeNumber,
            expiresAt: query.exp,
            nowMillis,
            signatureHex: query.sig,
          }),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new AuthError({
                message: cause.message,
                status: 403,
              }),
          ),
        );

        if (!isAuthorized) {
          return yield* new AuthError({
            message: "Forbidden or expired",
            status: 403,
          });
        }

        const resolvedEpisodeFile = yield* Effect.flatMap(AnimeService, (service) =>
          service.resolveEpisodeFile(params.id, params.episodeNumber),
        );

        switch (resolvedEpisodeFile._tag) {
          case "EpisodeFileUnmapped":
          case "EpisodeFileMissing":
            return yield* new AuthError({
              message: "Episode file not found",
              status: 404,
            });
          case "EpisodeFileRootInaccessible":
            return yield* new AuthError({
              message: "Anime root folder is inaccessible",
              status: 404,
            });
          case "EpisodeFileOutsideRoot":
            return yield* new AuthError({
              message: "Episode file mapping is invalid",
              status: 404,
            });
          case "EpisodeFileResolved":
            break;
        }

        const fs = yield* FileSystem;
        const fileInfo = yield* fs
          .stat(resolvedEpisodeFile.filePath)
          .pipe(
            Effect.mapError(
              () => new AuthError({ message: "Episode file not found", status: 404 }),
            ),
          );
        const byteRange = yield* parseByteRange(request.headers.range, fileInfo.size);

        return {
          contentLength: byteRange ? byteRange.end - byteRange.start + 1 : fileInfo.size,
          contentType: guessContentType(resolvedEpisodeFile.fileName),
          fileName: resolvedEpisodeFile.fileName,
          fileSize: fileInfo.size,
          fs,
          filePath: resolvedEpisodeFile.filePath,
          range: byteRange,
          status: byteRange ? 206 : 200,
        };
      }),
      (value) =>
        Effect.succeed(
          HttpServerResponse.stream(
            createFileChunkStream(value.fs, value.filePath, {
              range: value.range,
            }),
            {
              contentType: value.contentType,
              headers: {
                ...(value.range
                  ? {
                      "Content-Range": `bytes ${value.range.start}-${value.range.end}/${value.fileSize}`,
                    }
                  : {}),
                "Accept-Ranges": "bytes",
                "Content-Disposition": `inline; filename="${value.fileName}"`,
                "Content-Length": value.contentLength.toString(),
              },
              status: value.status,
            },
          ),
        ),
    ),
  ),
);

export const animeRouter = HttpRouter.concatAll(
  animeReadRouter,
  animeWriteRouter,
  animeStreamRouter,
);

function parseByteRange(
  rangeHeader: string | undefined,
  fileSize: number,
): Effect.Effect<FileByteRange | undefined, EpisodeStreamRangeError> {
  if (!rangeHeader) {
    return Effect.void.pipe(Effect.as(undefined));
  }

  const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader.trim());

  if (!match) {
    return Effect.fail(
      new EpisodeStreamRangeError({
        fileSize,
        message: "Requested range not satisfiable",
        status: 416,
      }),
    );
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize ||
    end >= fileSize
  ) {
    return Effect.fail(
      new EpisodeStreamRangeError({
        fileSize,
        message: "Requested range not satisfiable",
        status: 416,
      }),
    );
  }

  return Effect.succeed({ end, start });
}
