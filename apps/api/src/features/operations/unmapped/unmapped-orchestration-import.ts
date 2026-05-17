import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Stream } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import {
  type FileSystemShape,
  isWithinPathRoot,
  sanitizePathSegmentEffect,
} from "@/infra/filesystem/filesystem.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/infra/media/identity/identity.ts";
import { inferAiredAt } from "@/domain/media/derivations.ts";
import { resolveAnimeRootFolderEffect } from "@/features/media/shared/config-support.ts";
import { decodeMediaKind } from "@/features/media/shared/media-kind.ts";
import {
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import { appendLog } from "@/features/operations/shared/job-support.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/media/shared/media-read-repository.ts";
import { getConfigLibraryPath } from "@/features/operations/repository/config-repository.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";
import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface UnmappedImportWorkflowShape {
  readonly importUnmappedFolder: (input: {
    folder_name: string;
    media_id: number;
    profile_name?: string;
  }) => Effect.Effect<
    void,
    | DatabaseError
    | OperationsAnimeNotFoundError
    | OperationsConflictError
    | OperationsInputError
    | OperationsPathError
    | OperationsInfrastructureError
  >;
}

export class UnmappedImportService extends Context.Tag("@bakarr/api/UnmappedImportService")<
  UnmappedImportService,
  UnmappedImportWorkflowShape
>() {}

export const cleanupPreviousAnimeRootFolderAfterImport = Effect.fn(
  "OperationsService.cleanupPreviousAnimeRootFolderAfterImport",
)(function* (fs: FileSystemShape, previousRootFolder: string, nextRootFolder: string) {
  if (previousRootFolder === nextRootFolder) {
    return;
  }

  const previousEntries = yield* Effect.either(fs.readDir(previousRootFolder));

  if (previousEntries._tag === "Left") {
    yield* Effect.logWarning("Skipped previous media folder cleanup after import").pipe(
      Effect.annotateLogs({
        error: String(previousEntries.left),
        folder_path: previousRootFolder,
      }),
    );
    return;
  }

  if (previousEntries.right.length === 0) {
    yield* fs.remove(previousRootFolder, { recursive: true }).pipe(
      Effect.catchTag("FileSystemError", (fsError) =>
        Effect.logWarning("Failed to remove empty media folder after import").pipe(
          Effect.annotateLogs({
            error: String(fsError),
            folder_path: previousRootFolder,
          }),
          Effect.asVoid,
        ),
      ),
    );
  }
});

export function makeUnmappedImportWorkflow(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, fs, nowIso, tryDatabasePromise } = input;

  type EpisodeImportMapping = {
    readonly aired: string | null;
    readonly unitNumber: number;
    readonly filePath: string;
  };

  const importUnmappedFolder = Effect.fn("OperationsService.importUnmappedFolder")(
    function* (input: { folder_name: string; media_id: number; profile_name?: string }) {
      const animeRow = yield* requireAnime(db, input.media_id);
      const mediaKind = decodeMediaKind(animeRow.mediaKind);
      const libraryPath = yield* getConfigLibraryPath(db, mediaKind);
      const folderName = yield* sanitizePathSegmentEffect(input.folder_name).pipe(
        Effect.mapError(
          (cause) =>
            new OperationsInputError({
              cause,
              message: "folder_name must be a single folder name",
            }),
        ),
      );
      const folderPath = `${libraryPath.replace(/\/$/, "")}/${folderName}`;

      if (!isWithinPathRoot(folderPath, libraryPath)) {
        return yield* new OperationsInputError({
          message: "folder_name must stay within the library root",
        });
      }

      const existingOwner = yield* tryDatabasePromise("Failed to import unmapped folder", () =>
        db
          .select({ id: media.id, titleRomaji: media.titleRomaji })
          .from(media)
          .where(eq(media.rootFolder, folderPath))
          .limit(1),
      );

      if (existingOwner[0] && existingOwner[0].id !== input.media_id) {
        return yield* new OperationsConflictError({
          message: `Folder ${folderName} is already mapped to ${existingOwner[0].titleRomaji}`,
        });
      }

      const rootFolder = yield* resolveAnimeRootFolderEffect(db, folderPath, animeRow.titleRomaji, {
        mediaKind,
        useExistingRoot: true,
      }).pipe(
        Effect.catchTag("StoredDataError", (e) =>
          Effect.fail(
            new OperationsInfrastructureError({
              message: "Failed to import unmapped folder",
              cause: e,
            }),
          ),
        ),
      );

      const requestedProfileName = input.profile_name?.trim();
      const nextProfileName =
        requestedProfileName && requestedProfileName.length > 0
          ? requestedProfileName
          : animeRow.profileName;

      const fallbackNowIso = yield* nowIso();
      const episodeMappings = yield* Stream.runFold(
        scanVideoFilesStream(fs, folderPath).pipe(
          Stream.mapError(
            (cause) =>
              new OperationsPathError({
                cause,
                message: `Folder is inaccessible: ${folderPath}`,
              }),
          ),
        ),
        [] as EpisodeImportMapping[],
        (acc, file) => {
          const classification = classifyMediaArtifact(file.path, file.name);
          if (classification.kind === "extra" || classification.kind === "sample") {
            return acc;
          }

          const parsed = parseFileSourceIdentity(file.path);
          const identity = parsed.source_identity;
          if (!identity || identity.scheme === "daily") {
            return acc;
          }

          const unitNumbers = identity.unit_numbers;
          if (unitNumbers.length === 0) {
            return acc;
          }

          for (const unitNumber of unitNumbers) {
            acc.push({
              aired: inferAiredAt(
                animeRow.status,
                unitNumber,
                animeRow.unitCount ?? undefined,
                animeRow.startDate ?? undefined,
                animeRow.endDate ?? undefined,
                undefined,
                fallbackNowIso,
              ),
              unitNumber,
              filePath: file.path,
            });
          }

          return acc;
        },
      );

      yield* tryDatabasePromise("Failed to import unmapped folder", () =>
        db.transaction(async (tx) => {
          await tx
            .update(media)
            .set({
              profileName: nextProfileName,
              rootFolder,
            })
            .where(eq(media.id, input.media_id));

          for (const mapping of episodeMappings) {
            await tx
              .insert(mediaUnits)
              .values({
                aired: mapping.aired,
                mediaId: input.media_id,
                downloaded: true,
                filePath: mapping.filePath,
                number: mapping.unitNumber,
                title: null,
              })
              .onConflictDoUpdate({
                target: [mediaUnits.mediaId, mediaUnits.number],
                set: {
                  downloaded: true,
                  filePath: mapping.filePath,
                },
              });
          }
        }),
      );

      yield* cleanupPreviousAnimeRootFolderAfterImport(fs, animeRow.rootFolder, rootFolder);

      const imported = episodeMappings.length;

      yield* appendLog(
        db,
        "library.unmapped.imported",
        "success",
        `Mapped ${folderName} as the root folder for media ${input.media_id} and imported ${imported} episode(s)`,
        nowIso,
      );
      return undefined;
    },
  );

  return {
    importUnmappedFolder,
  } satisfies UnmappedImportWorkflowShape;
}

export const UnmappedImportServiceLive = Layer.effect(
  UnmappedImportService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const fs = yield* FileSystem;
    const clock = yield* ClockService;

    return makeUnmappedImportWorkflow({
      db,
      fs,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });
  }),
);
