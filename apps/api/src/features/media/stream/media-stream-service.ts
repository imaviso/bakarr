import { Effect, Match } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { AppDrizzleDatabase } from "@/db/database.ts";
import { currentTimeMillis } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { StreamAccessError } from "@/features/media/stream/media-stream-errors.ts";
import { resolveUnitFileEffect } from "@/features/media/files/media-file-read.ts";
import { StreamTokenSigner } from "@/features/media/stream/stream-token-signer.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

const STREAM_EXPIRY_MS = 6 * 60 * 60 * 1000;

export interface ResolvedStreamFile {
  readonly fileName: string;
  readonly filePath: string;
  readonly fileSize: number;
}

export interface MediaStreamServiceShape {
  readonly createStreamUrl: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<{ readonly url: string }, StreamAccessError>;
  readonly resolveAuthorizedStreamFile: (input: {
    readonly mediaId: number;
    readonly unitNumber: number;
    readonly expiresAt: number;
    readonly signatureHex: string;
  }) => Effect.Effect<ResolvedStreamFile, DatabaseError | MediaNotFoundError | StreamAccessError>;
}

const makeMediaStreamService = Effect.fn("MediaStreamService.make")(function* () {
  const db = yield* AppDrizzleDatabase;
  const fs = yield* FileSystem;
  const mediaReadRepository = yield* MediaReadRepository;
  const signer = yield* StreamTokenSigner;

  const createStreamUrl = Effect.fn("MediaStreamService.createStreamUrl")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    const now = yield* currentTimeMillis;
    const expiresAt = now + STREAM_EXPIRY_MS;
    const signature = yield* signer.sign({ mediaId, unitNumber, expiresAt }).pipe(
      Effect.mapError(
        (cause) =>
          new StreamAccessError({
            cause,
            message: "Failed to sign stream URL",
            status: 400,
          }),
      ),
    );

    return {
      url: buildStreamPath(mediaId, unitNumber, expiresAt, signature),
    };
  });

  const resolveAuthorizedStreamFile = Effect.fn("MediaStreamService.resolveAuthorizedStreamFile")(
    function* (input: {
      readonly mediaId: number;
      readonly unitNumber: number;
      readonly expiresAt: number;
      readonly signatureHex: string;
    }) {
      const nowMillis = yield* currentTimeMillis;
      const isAuthorized = yield* signer
        .verify({
          mediaId: input.mediaId,
          unitNumber: input.unitNumber,
          expiresAt: input.expiresAt,
          nowMillis,
          signatureHex: input.signatureHex,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new StreamAccessError({
                cause,
                message: cause.message,
                status: 403,
              }),
          ),
        );

      if (!isAuthorized) {
        return yield* new StreamAccessError({
          message: "Forbidden or expired",
          status: 403,
        });
      }

      const resolvedEpisodeFile = yield* resolveUnitFileEffect({
        mediaId: input.mediaId,
        db,
        mediaReadRepository,
        unitNumber: input.unitNumber,
        fs,
      });

      const unitFile = yield* Match.value(resolvedEpisodeFile).pipe(
        Match.tag("EpisodeFileUnmapped", "EpisodeFileMissing", () =>
          Effect.fail(new StreamAccessError({ message: "MediaUnit file not found", status: 404 })),
        ),
        Match.tag("EpisodeFileRootInaccessible", () =>
          Effect.fail(
            new StreamAccessError({
              message: "Media root folder is inaccessible",
              status: 404,
            }),
          ),
        ),
        Match.tag("EpisodeFileOutsideRoot", () =>
          Effect.fail(
            new StreamAccessError({
              message: "MediaUnit file mapping is invalid",
              status: 404,
            }),
          ),
        ),
        Match.tag("EpisodeFileResolved", (file) => Effect.succeed(file)),
        Match.exhaustive,
      );

      const fileInfo = yield* fs.stat(unitFile.filePath).pipe(
        Effect.mapError(
          (cause) =>
            new StreamAccessError({
              cause,
              message: "MediaUnit file not found",
              status: 404,
            }),
        ),
      );

      return {
        fileName: unitFile.fileName,
        filePath: unitFile.filePath,
        fileSize: fileInfo.size,
      } satisfies ResolvedStreamFile;
    },
  );

  return {
    createStreamUrl,
    resolveAuthorizedStreamFile,
  } satisfies MediaStreamServiceShape;
});

export class MediaStreamService extends Effect.Service<MediaStreamService>()(
  "@bakarr/api/MediaStreamService",
  {
    effect: makeMediaStreamService(),
  },
) {}

export const MediaStreamServiceLive = MediaStreamService.Default;

function buildStreamPath(
  mediaId: number,
  unitNumber: number,
  expiresAt: number,
  signature: string,
) {
  return `/api/stream/${mediaId}/${unitNumber}?exp=${expiresAt}&sig=${signature}`;
}
