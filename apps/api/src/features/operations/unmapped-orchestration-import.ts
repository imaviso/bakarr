import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import {
  type FileSystemShape,
  isWithinPathRoot,
  sanitizePathSegmentEffect,
} from "../../lib/filesystem.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "../../lib/media-identity.ts";
import { inferAiredAt } from "../../lib/anime-derivations.ts";
import { AnimeImportService } from "../anime/import-service.ts";
import { resolveAnimeRootFolderEffect } from "../anime/config-support.ts";
import {
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  OperationsInfrastructureError,
} from "./errors.ts";
import { appendLog } from "./job-support.ts";
import { scanVideoFiles } from "./file-scanner.ts";
import { getConfigLibraryPath, requireAnime } from "./repository.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";

export interface UnmappedImportWorkflowShape {
  readonly importUnmappedFolder: (input: {
    folder_name: string;
    anime_id: number;
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

export const cleanupPreviousAnimeRootFolderAfterImport = Effect.fn(
  "OperationsService.cleanupPreviousAnimeRootFolderAfterImport",
)(function* (fs: FileSystemShape, previousRootFolder: string, nextRootFolder: string) {
  if (previousRootFolder === nextRootFolder) {
    return;
  }

  const previousEntries = yield* Effect.either(fs.readDir(previousRootFolder));

  if (previousEntries._tag === "Left") {
    yield* Effect.logWarning("Skipped previous anime folder cleanup after import").pipe(
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
        Effect.logWarning("Failed to remove empty anime folder after import").pipe(
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
  animeImportService: typeof AnimeImportService.Service;
  db: AppDatabase;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { animeImportService, db, fs, nowIso, tryDatabasePromise } = input;

  const importUnmappedFolder = Effect.fn("OperationsService.importUnmappedFolder")(
    function* (input: { folder_name: string; anime_id: number; profile_name?: string }) {
      const animeRow = yield* requireAnime(db, input.anime_id);
      const libraryPath = yield* getConfigLibraryPath(db);
      const folderName = yield* sanitizePathSegmentEffect(input.folder_name).pipe(
        Effect.mapError(
          () =>
            new OperationsInputError({
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
          .select({ id: anime.id, titleRomaji: anime.titleRomaji })
          .from(anime)
          .where(eq(anime.rootFolder, folderPath))
          .limit(1),
      );

      if (existingOwner[0] && existingOwner[0].id !== input.anime_id) {
        return yield* new OperationsConflictError({
          message: `Folder ${folderName} is already mapped to ${existingOwner[0].titleRomaji}`,
        });
      }

      const rootFolder = yield* resolveAnimeRootFolderEffect(db, folderPath, animeRow.titleRomaji, {
        useExistingRoot: true,
      }).pipe(
        Effect.catchTag("AnimeStoredDataError", (e) =>
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

      const files = yield* scanVideoFiles(fs, folderPath).pipe(
        Effect.mapError(
          () =>
            new OperationsPathError({
              message: `Folder is inaccessible: ${folderPath}`,
            }),
        ),
      );

      yield* tryDatabasePromise("Failed to import unmapped folder", () =>
        db
          .update(anime)
          .set({
            profileName: nextProfileName,
            rootFolder,
          })
          .where(eq(anime.id, input.anime_id)),
      );

      yield* cleanupPreviousAnimeRootFolderAfterImport(fs, animeRow.rootFolder, rootFolder);

      let imported = 0;

      for (const file of files) {
        const classification = classifyMediaArtifact(file.path, file.name);
        if (classification.kind === "extra" || classification.kind === "sample") {
          continue;
        }

        const parsed = parseFileSourceIdentity(file.path);
        const identity = parsed.source_identity;
        if (!identity || identity.scheme === "daily") {
          continue;
        }

        const episodeNumbers = identity.episode_numbers;
        if (episodeNumbers.length === 0) {
          continue;
        }

        const currentIso = yield* nowIso();

        for (const episodeNumber of episodeNumbers) {
          yield* animeImportService
            .upsertEpisode(input.anime_id, episodeNumber, {
              aired: inferAiredAt(
                animeRow.status,
                episodeNumber,
                animeRow.episodeCount ?? undefined,
                animeRow.startDate ?? undefined,
                animeRow.endDate ?? undefined,
                undefined,
                currentIso,
              ),
              downloaded: true,
              filePath: file.path,
              title: null,
            })
            .pipe(
              Effect.catchTag("AnimeStoredDataError", (e) =>
                Effect.fail(
                  new OperationsInfrastructureError({
                    message: "Failed to import unmapped folder",
                    cause: e,
                  }),
                ),
              ),
            );
        }
        imported += episodeNumbers.length;
      }

      yield* appendLog(
        db,
        "library.unmapped.imported",
        "success",
        `Mapped ${folderName} as the root folder for anime ${input.anime_id} and imported ${imported} episode(s)`,
        nowIso,
      );
    },
  );

  return {
    importUnmappedFolder,
  } satisfies UnmappedImportWorkflowShape;
}
