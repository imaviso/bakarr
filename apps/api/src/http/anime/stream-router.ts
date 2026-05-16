import { HttpServerRequest, HttpServerResponse, HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeStreamService } from "@/features/anime/stream/anime-stream-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { AnimeEpisodeParamsSchema, StreamQuerySchema } from "@/http/anime/request-schemas.ts";
import { parseEpisodeStreamRange } from "@/http/anime/streaming-range.ts";
import { createFileChunkStream } from "@/http/file-stream.ts";
import { contentType } from "@/http/shared/route-fs.ts";
import { EpisodeStreamAccessError } from "@/features/anime/stream/anime-stream-errors.ts";
import {
  decodePathParams,
  decodeQueryWithLabel,
  routeResponse,
} from "@/http/shared/router-helpers.ts";

export const animeStreamRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/stream/:id/:episodeNumber",
    routeResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(AnimeEpisodeParamsSchema);
        const query = yield* decodeQueryWithLabel(StreamQuerySchema, "stream access").pipe(
          Effect.mapError(
            (cause) =>
              new EpisodeStreamAccessError({
                cause,
                message: "Forbidden or expired",
                status: 403,
              }),
          ),
        );

        const request = yield* HttpServerRequest.HttpServerRequest;
        const streamService = yield* AnimeStreamService;
        const fs = yield* FileSystem;
        const streamFile = yield* streamService.resolveAuthorizedEpisodeStreamFile({
          animeId: params.id,
          episodeNumber: params.episodeNumber,
          expiresAt: query.exp,
          signatureHex: query.sig,
        });

        const rangeHeader = request.headers["range"];
        const byteRange = yield* parseEpisodeStreamRange(rangeHeader, streamFile.fileSize);
        const contentLength = (
          byteRange ? byteRange.end - byteRange.start + 1 : streamFile.fileSize
        ).toString();
        const headers: Record<string, string> = {
          "Accept-Ranges": "bytes",
          "Content-Disposition": inlineContentDisposition(streamFile.fileName),
          "Content-Length": contentLength,
        };

        if (byteRange) {
          headers["Content-Range"] =
            `bytes ${byteRange.start}-${byteRange.end}/${streamFile.fileSize}`;
        }

        return HttpServerResponse.stream(
          createFileChunkStream(
            fs,
            streamFile.filePath,
            byteRange === undefined ? {} : { range: byteRange },
          ),
          {
            contentType: contentType(streamFile.fileName),
            headers,
            status: byteRange ? 206 : 200,
          },
        );
      }),
      Effect.succeed,
    ),
  ),
);

function inlineContentDisposition(fileName: string) {
  const sanitized = fileName.replace(/[\r\n]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
