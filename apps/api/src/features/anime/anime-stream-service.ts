import { Context, Effect, Layer, Match } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { ClockService } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { AnimeNotFoundError } from "@/features/anime/errors.ts";
import { resolveEpisodeFileEffect } from "@/features/anime/anime-file-read.ts";
import { createFileChunkStream } from "@/http/file-stream.ts";
import { StreamTokenSigner } from "@/http/stream-token-signer.ts";
import { EpisodeStreamAccessError, EpisodeStreamRangeError } from "@/http/streaming-errors.ts";
import { contentType } from "@/http/route-fs.ts";
import { parseEpisodeStreamRange } from "@/http/anime-streaming-range.ts";

const STREAM_EXPIRY_MS = 6 * 60 * 60 * 1000;

export interface ResolvedAnimeStreamFile {
  readonly fileName: string;
  readonly filePath: string;
  readonly fileSize: number;
}

export interface AnimeEpisodeStreamResponse {
  readonly contentType: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: 200 | 206;
  readonly stream: ReturnType<typeof createFileChunkStream>;
}

export interface AnimeStreamServiceShape {
  readonly createEpisodeStreamUrl: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<{ readonly url: string }, EpisodeStreamAccessError>;
  readonly resolveAuthorizedEpisodeStreamFile: (input: {
    readonly animeId: number;
    readonly episodeNumber: number;
    readonly expiresAt: number;
    readonly signatureHex: string;
  }) => Effect.Effect<
    ResolvedAnimeStreamFile,
    DatabaseError | AnimeNotFoundError | EpisodeStreamAccessError
  >;
  readonly buildEpisodeStreamResponse: (input: {
    readonly animeId: number;
    readonly episodeNumber: number;
    readonly expiresAt: number;
    readonly signatureHex: string;
    readonly rangeHeader?: string;
  }) => Effect.Effect<
    AnimeEpisodeStreamResponse,
    DatabaseError | AnimeNotFoundError | EpisodeStreamAccessError | EpisodeStreamRangeError
  >;
}

export class AnimeStreamService extends Context.Tag("@bakarr/api/AnimeStreamService")<
  AnimeStreamService,
  AnimeStreamServiceShape
>() {}

const makeAnimeStreamService = Effect.gen(function* () {
  const { db } = yield* Database;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const signer = yield* StreamTokenSigner;

  const createEpisodeStreamUrl = Effect.fn("AnimeStreamService.createEpisodeStreamUrl")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    const now = yield* clock.currentTimeMillis;
    const expiresAt = now + STREAM_EXPIRY_MS;
    const signature = yield* signer.sign({ animeId, episodeNumber, expiresAt }).pipe(
      Effect.mapError(
        () =>
          new EpisodeStreamAccessError({
            message: "Failed to sign stream URL",
            status: 400,
          }),
      ),
    );

    return {
      url: `/api/stream/${animeId}/${episodeNumber}?exp=${expiresAt}&sig=${signature}`,
    };
  });

  const resolveAuthorizedEpisodeStreamFile = Effect.fn(
    "AnimeStreamService.resolveAuthorizedEpisodeStreamFile",
  )(function* (input: {
    readonly animeId: number;
    readonly episodeNumber: number;
    readonly expiresAt: number;
    readonly signatureHex: string;
  }) {
    const nowMillis = yield* clock.currentTimeMillis;
    const isAuthorized = yield* signer
      .verify({
        animeId: input.animeId,
        episodeNumber: input.episodeNumber,
        expiresAt: input.expiresAt,
        nowMillis,
        signatureHex: input.signatureHex,
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

    const resolvedEpisodeFile = yield* resolveEpisodeFileEffect({
      animeId: input.animeId,
      db,
      episodeNumber: input.episodeNumber,
      fs,
    });

    const episodeFile = yield* Match.value(resolvedEpisodeFile).pipe(
      Match.tag("EpisodeFileUnmapped", "EpisodeFileMissing", () =>
        Effect.fail(
          new EpisodeStreamAccessError({ message: "Episode file not found", status: 404 }),
        ),
      ),
      Match.tag("EpisodeFileRootInaccessible", () =>
        Effect.fail(
          new EpisodeStreamAccessError({
            message: "Anime root folder is inaccessible",
            status: 404,
          }),
        ),
      ),
      Match.tag("EpisodeFileOutsideRoot", () =>
        Effect.fail(
          new EpisodeStreamAccessError({
            message: "Episode file mapping is invalid",
            status: 404,
          }),
        ),
      ),
      Match.tag("EpisodeFileResolved", (file) => Effect.succeed(file)),
      Match.exhaustive,
    );

    const fileInfo = yield* fs
      .stat(episodeFile.filePath)
      .pipe(
        Effect.mapError(
          () => new EpisodeStreamAccessError({ message: "Episode file not found", status: 404 }),
        ),
      );

    return {
      fileName: episodeFile.fileName,
      filePath: episodeFile.filePath,
      fileSize: fileInfo.size,
    } satisfies ResolvedAnimeStreamFile;
  });

  const buildEpisodeStreamResponse = Effect.fn("AnimeStreamService.buildEpisodeStreamResponse")(
    function* (input: {
      readonly animeId: number;
      readonly episodeNumber: number;
      readonly expiresAt: number;
      readonly signatureHex: string;
      readonly rangeHeader?: string;
    }) {
      const streamFile = yield* resolveAuthorizedEpisodeStreamFile({
        animeId: input.animeId,
        episodeNumber: input.episodeNumber,
        expiresAt: input.expiresAt,
        signatureHex: input.signatureHex,
      });
      const byteRange = yield* parseEpisodeStreamRange(input.rangeHeader, streamFile.fileSize);
      const contentLength = (
        byteRange ? byteRange.end - byteRange.start + 1 : streamFile.fileSize
      ).toString();

      const headers: Record<string, string> = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${streamFile.fileName}"`,
        "Content-Length": contentLength,
      };

      if (byteRange) {
        headers["Content-Range"] =
          `bytes ${byteRange.start}-${byteRange.end}/${streamFile.fileSize}`;
      }

      return {
        contentType: contentType(streamFile.fileName),
        headers,
        status: byteRange ? 206 : 200,
        stream: createFileChunkStream(fs, streamFile.filePath, {
          range: byteRange,
        }),
      } satisfies AnimeEpisodeStreamResponse;
    },
  );

  return AnimeStreamService.of({
    buildEpisodeStreamResponse,
    createEpisodeStreamUrl,
    resolveAuthorizedEpisodeStreamFile,
  });
});

export const AnimeStreamServiceLive = Layer.effect(AnimeStreamService, makeAnimeStreamService);
