import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Match, Schema } from "effect";

import { AnimeFileService } from "../features/anime/service.ts";
import { AuthError } from "../features/auth/service.ts";
import { ClockService } from "../lib/clock.ts";
import { FileSystem } from "../lib/filesystem.ts";
import { createFileChunkStream, type FileByteRange } from "./file-stream.ts";
import { StreamQuerySchema } from "./anime-request-schemas.ts";
import { EpisodeStreamRangeError } from "./streaming-errors.ts";
import { StreamTokenSigner } from "./stream-token-signer.ts";
import { contentType } from "./route-fs.ts";

/** Duration of a signed stream URL in milliseconds (6 hours). */
const STREAM_EXPIRY_MS = 6 * 60 * 60 * 1000;

export interface AnimeStreamUrlInput {
  readonly animeId: number;
  readonly episodeNumber: number;
}

export interface AnimeStreamResponseInput {
  readonly animeId: number;
  readonly episodeNumber: number;
}

export const buildAnimeStreamUrl = Effect.fn("AnimeStream.buildUrl")(function* (
  input: AnimeStreamUrlInput,
) {
  const clock = yield* ClockService;
  const now = yield* clock.currentTimeMillis;
  const expiresAt = now + STREAM_EXPIRY_MS;
  const signer = yield* StreamTokenSigner;
  const signature = yield* signer
    .sign({ animeId: input.animeId, episodeNumber: input.episodeNumber, expiresAt })
    .pipe(
      Effect.mapError(() => new AuthError({ message: "Failed to sign stream URL", status: 400 })),
    );

  return {
    url: `/api/stream/${input.animeId}/${input.episodeNumber}?exp=${expiresAt}&sig=${signature}`,
  };
});

export const buildAnimeStreamResponse = Effect.fn("AnimeStream.buildResponse")(function* (
  input: AnimeStreamResponseInput,
) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const url = new URL(request.url, "http://bakarr.local");
  const query = yield* Schema.decodeUnknown(StreamQuerySchema)({
    exp: url.searchParams.get("exp") ?? "",
    sig: url.searchParams.get("sig") ?? "",
  }).pipe(Effect.mapError(() => new AuthError({ message: "Forbidden or expired", status: 403 })));
  const clock = yield* ClockService;
  const nowMillis = yield* clock.currentTimeMillis;
  const signer = yield* StreamTokenSigner;
  const isAuthorized = yield* signer
    .verify({
      animeId: input.animeId,
      episodeNumber: input.episodeNumber,
      expiresAt: query.exp,
      nowMillis,
      signatureHex: query.sig,
    })
    .pipe(Effect.mapError((cause) => new AuthError({ message: cause.message, status: 403 })));

  if (!isAuthorized) {
    return yield* new AuthError({ message: "Forbidden or expired", status: 403 });
  }

  const animeService = yield* AnimeFileService;
  const resolvedEpisodeFile = yield* animeService.resolveEpisodeFile(
    input.animeId,
    input.episodeNumber,
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
    .pipe(Effect.mapError(() => new AuthError({ message: "Episode file not found", status: 404 })));
  const byteRange = yield* parseByteRange(request.headers.range, fileInfo.size);

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
});

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
