import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Match, Schema } from "effect";

import { AnimeService } from "../features/anime/service.ts";
import { AnimeEnrollmentService } from "../features/anime/anime-enrollment-service.ts";
import { AuthError } from "../features/auth/service.ts";
import { LibraryService, RssService } from "../features/operations/service.ts";
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
          return yield* (yield* AnimeService).listAnime({
            limit: query.limit,
            monitored: query.monitored,
            offset: query.offset,
          });
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
          return yield* (yield* AnimeService).searchAnime(query.q ?? "");
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
          return yield* (yield* AnimeService).getAnimeByAnilistId(params.id);
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
          return yield* (yield* AnimeService).getAnime(params.id);
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
          return yield* (yield* AnimeService).listEpisodes(params.id);
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
          return yield* (yield* AnimeService).listFiles(params.id);
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
          return yield* (yield* RssService).listAnimeRssFeeds(params.id);
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
          return yield* (yield* LibraryService).getRenamePreview(params.id);
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
          return yield* (yield* AnimeEnrollmentService).enroll(body);
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
          yield* (yield* AnimeService).deleteAnime(params.id);
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
          yield* (yield* AnimeService).setMonitored(params.id, body.monitored);
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
          yield* (yield* AnimeService).updatePath(params.id, body.path);
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
          yield* (yield* AnimeService).updateProfile(params.id, body.profile_name);
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
          yield* (yield* AnimeService).updateReleaseProfiles(params.id, [
            ...body.release_profile_ids,
          ]);
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
          yield* (yield* AnimeService).refreshEpisodes(params.id);
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
          return yield* (yield* AnimeService).scanFolder(params.id);
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
          yield* (yield* AnimeService).deleteEpisodeFile(params.id, params.episodeNumber);
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
          yield* (yield* AnimeService).mapEpisode(params.id, params.episodeNumber, body.file_path);
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
          yield* (yield* AnimeService).bulkMapEpisodes(params.id, [...body.mappings]);
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
          const clock = yield* ClockService;
          const now = yield* clock.currentTimeMillis;
          const expiresAt = now + STREAM_EXPIRY_MS;
          const signer = yield* StreamTokenSigner;
          const signature = yield* signer
            .sign({ animeId: params.id, episodeNumber: query.episodeNumber, expiresAt })
            .pipe(
              Effect.mapError(
                () => new AuthError({ message: "Failed to sign stream URL", status: 400 }),
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
          return yield* (yield* LibraryService).renameFiles(params.id);
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
          Effect.mapError(() => new AuthError({ message: "Forbidden or expired", status: 403 })),
        );
        const clock = yield* ClockService;
        const nowMillis = yield* clock.currentTimeMillis;
        const signer = yield* StreamTokenSigner;
        const isAuthorized = yield* signer
          .verify({
            animeId: params.id,
            episodeNumber: params.episodeNumber,
            expiresAt: query.exp,
            nowMillis,
            signatureHex: query.sig,
          })
          .pipe(Effect.mapError((cause) => new AuthError({ message: cause.message, status: 403 })));

        if (!isAuthorized) {
          return yield* new AuthError({ message: "Forbidden or expired", status: 403 });
        }

        const animeService = yield* AnimeService;
        const resolvedEpisodeFile = yield* animeService.resolveEpisodeFile(
          params.id,
          params.episodeNumber,
        );

        const notFoundError = (message: string) => new AuthError({ message, status: 404 });

        const episodeFilePath = yield* Match.value(resolvedEpisodeFile).pipe(
          Match.tag("EpisodeFileUnmapped", "EpisodeFileMissing", () =>
            Effect.fail(notFoundError("Episode file not found")),
          ),
          Match.tag("EpisodeFileRootInaccessible", () =>
            Effect.fail(notFoundError("Anime root folder is inaccessible")),
          ),
          Match.tag("EpisodeFileOutsideRoot", () =>
            Effect.fail(notFoundError("Episode file mapping is invalid")),
          ),
          Match.tag("EpisodeFileResolved", (f) => Effect.succeed(f)),
          Match.exhaustive,
        );

        const fs = yield* FileSystem;
        const fileInfo = yield* fs
          .stat(episodeFilePath.filePath)
          .pipe(
            Effect.mapError(
              () => new AuthError({ message: "Episode file not found", status: 404 }),
            ),
          );
        const byteRange = yield* parseByteRange(request.headers.range, fileInfo.size);

        return {
          contentLength: byteRange ? byteRange.end - byteRange.start + 1 : fileInfo.size,
          contentType: guessContentType(episodeFilePath.fileName),
          fileName: episodeFilePath.fileName,
          fileSize: fileInfo.size,
          fs,
          filePath: episodeFilePath.filePath,
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
