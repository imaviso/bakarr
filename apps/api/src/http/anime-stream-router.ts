import { HttpServerRequest, HttpServerResponse, HttpRouter } from "@effect/platform";
import { Effect, Match, Schema } from "effect";

import { AnimeFileService } from "../features/anime/file-service.ts";
import { ClockService } from "../lib/clock.ts";
import { FileSystem } from "../lib/filesystem.ts";
import { AnimeEpisodeParamsSchema, StreamQuerySchema } from "./anime-request-schemas.ts";
import { createFileChunkStream } from "./file-stream.ts";
import { EpisodeStreamAccessError } from "./streaming-errors.ts";
import { StreamTokenSigner } from "./stream-token-signer.ts";
import { contentType } from "./route-fs.ts";
import { parseEpisodeStreamRange } from "./anime-streaming-range.ts";
import { decodePathParams, routeResponse } from "./router-helpers.ts";

export const animeStreamRouter = HttpRouter.empty.pipe(
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
            () => new EpisodeStreamAccessError({ message: "Forbidden or expired", status: 403 }),
          ),
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
          .pipe(
            Effect.mapError(
              (cause) => new EpisodeStreamAccessError({ message: cause.message, status: 403 }),
            ),
          );

        if (!isAuthorized) {
          return yield* new EpisodeStreamAccessError({
            message: "Forbidden or expired",
            status: 403,
          });
        }

        const animeService = yield* AnimeFileService;
        const resolvedEpisodeFile = yield* animeService.resolveEpisodeFile(
          params.id,
          params.episodeNumber,
        );

        const notFoundError = (message: string) =>
          new EpisodeStreamAccessError({ message, status: 404 });

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
              () =>
                new EpisodeStreamAccessError({ message: "Episode file not found", status: 404 }),
            ),
          );
        const byteRange = yield* parseEpisodeStreamRange(request.headers.range, fileInfo.size);

        return HttpServerResponse.stream(
          createFileChunkStream(fs, episodeFilePath.filePath, {
            range: byteRange,
          }),
          {
            contentType: contentType(episodeFilePath.fileName),
            headers: {
              ...(byteRange
                ? {
                    "Content-Range": `bytes ${byteRange.start}-${byteRange.end}/${fileInfo.size}`,
                  }
                : {}),
              "Accept-Ranges": "bytes",
              "Content-Disposition": `inline; filename="${episodeFilePath.fileName}"`,
              "Content-Length": (byteRange
                ? byteRange.end - byteRange.start + 1
                : fileInfo.size
              ).toString(),
            },
            status: byteRange ? 206 : 200,
          },
        );
      }),
      Effect.succeed,
    ),
  ),
);
