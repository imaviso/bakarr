import { HttpServerRequest, HttpServerResponse, HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeStreamService } from "@/features/anime/anime-stream-service.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { AnimeEpisodeParamsSchema, StreamQuerySchema } from "@/http/anime-request-schemas.ts";
import { createFileChunkStream } from "@/http/file-stream.ts";
import { EpisodeStreamAccessError } from "@/http/streaming-errors.ts";
import { contentType } from "@/http/route-fs.ts";
import { parseEpisodeStreamRange } from "@/http/anime-streaming-range.ts";
import { decodePathParams, decodeQueryWithLabel, routeResponse } from "@/http/router-helpers.ts";

export const animeStreamRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/stream/:id/:episodeNumber",
    routeResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        const query = yield* decodeQueryWithLabel(StreamQuerySchema, "stream access").pipe(
          Effect.mapError(
            () => new EpisodeStreamAccessError({ message: "Forbidden or expired", status: 403 }),
          ),
        );

        const request = yield* HttpServerRequest.HttpServerRequest;
        const streamFile = yield* (yield* AnimeStreamService).resolveAuthorizedEpisodeStreamFile({
          animeId: params.id,
          episodeNumber: params.episodeNumber,
          expiresAt: query.exp,
          signatureHex: query.sig,
        });
        const byteRange = yield* parseEpisodeStreamRange(
          request.headers.range,
          streamFile.fileSize,
        );
        const fs = yield* FileSystem;

        return HttpServerResponse.stream(
          createFileChunkStream(fs, streamFile.filePath, {
            range: byteRange,
          }),
          {
            contentType: contentType(streamFile.fileName),
            headers: {
              ...(byteRange
                ? {
                    "Content-Range": `bytes ${byteRange.start}-${byteRange.end}/${streamFile.fileSize}`,
                  }
                : {}),
              "Accept-Ranges": "bytes",
              "Content-Disposition": `inline; filename="${streamFile.fileName}"`,
              "Content-Length": (byteRange
                ? byteRange.end - byteRange.start + 1
                : streamFile.fileSize
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
