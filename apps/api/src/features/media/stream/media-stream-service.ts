import { Config, Context, Duration, Effect, Layer, Option, Schema } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { currentTimeMillis } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { StreamAccessError } from "@/features/media/stream/media-stream-errors.ts";
import { resolveUnitFileEffect } from "@/features/media/files/media-file-read.ts";
import { StreamTokenSigner } from "@/features/media/stream/stream-token-signer.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";

const DEFAULT_STREAM_EXPIRY_SECONDS = Duration.toSeconds(Duration.hours(6));

const StreamExpirySecondsSchema = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 60, maximum: 86400 })),
);

/**
 * Resolved once during layer construction. A missing env var falls back to
 * the default; a present-but-invalid value fails startup loudly instead of
 * silently degrading every stream URL.
 */
const resolveStreamExpiryMs = Effect.fn("MediaStream.resolveStreamExpiryMs")(function* () {
  const seconds = yield* Config.option(
    Config.schema(StreamExpirySecondsSchema, "BAKARR_STREAM_EXPIRY_SECONDS"),
  ).pipe(Effect.map(Option.getOrElse(() => DEFAULT_STREAM_EXPIRY_SECONDS)));
  return Duration.toMillis(Duration.seconds(seconds));
});

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
  const fs = yield* FileSystem;
  const mediaRepository = yield* MediaRepository;
  const signer = yield* StreamTokenSigner;
  const expiryMs = yield* resolveStreamExpiryMs();

  const createStreamUrl = Effect.fn("MediaStreamService.createStreamUrl")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    const now = yield* currentTimeMillis;
    const expiresAt = now + expiryMs;
    const signature = yield* signer.sign({ mediaId, unitNumber, expiresAt }).pipe(
      Effect.mapError(
        (cause) =>
          new StreamAccessError({
            cause,
            message: "Failed to sign stream URL",
            status: 500,
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

      const unitFile = yield* resolveUnitFileEffect({
        mediaId: input.mediaId,
        mediaRepository,
        unitNumber: input.unitNumber,
        fs,
      }).pipe(
        Effect.catchTag(
          "UnitFileResolveError",
          (error) =>
            new StreamAccessError({
              message: error.message,
              status: 404,
            }),
        ),
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

export class MediaStreamService extends Context.Service<
  MediaStreamService,
  MediaStreamServiceShape
>()("@bakarr/api/MediaStreamService") {
  static readonly layer = Layer.effect(MediaStreamService, makeMediaStreamService());
}

export const MediaStreamServiceLive = MediaStreamService.layer;

function buildStreamPath(
  mediaId: number,
  unitNumber: number,
  expiresAt: number,
  signature: string,
) {
  return `/api/stream/${mediaId}/${unitNumber}?exp=${expiresAt}&sig=${signature}`;
}
