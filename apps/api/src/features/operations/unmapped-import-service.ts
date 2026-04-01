import { Context, Effect, Layer } from "effect";
import { eq } from "drizzle-orm";

import { Database } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem, isWithinPathRoot, sanitizePathSegmentEffect } from "@/lib/filesystem.ts";
import {
  type UnmappedImportWorkflowShape,
  cleanupPreviousAnimeRootFolderAfterImport,
} from "@/features/operations/unmapped-orchestration-import.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  OperationsConflictError,
  OperationsInfrastructureError,
  OperationsInputError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { appendLog } from "@/features/operations/job-support.ts";
import { scanVideoFiles } from "@/features/operations/file-scanner.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { getConfigLibraryPath } from "@/features/operations/repository/config-repository.ts";
import { resolveAnimeRootFolderEffect } from "@/features/anime/config-support.ts";
import { upsertEpisodeEffect } from "@/features/anime/anime-episode-repository.ts";
import { inferAiredAt } from "@/lib/anime-derivations.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/lib/media-identity.ts";

export type UnmappedImportServiceShape = UnmappedImportWorkflowShape;

export class UnmappedImportService extends Context.Tag("@bakarr/api/UnmappedImportService")<
  UnmappedImportService,
  UnmappedImportServiceShape
>() {}

const makeUnmappedImportService = Effect.gen(function* () {
  const { db } = yield* Database;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

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
          yield* upsertEpisodeEffect(db, input.anime_id, episodeNumber, {
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

  return UnmappedImportService.of({
    importUnmappedFolder,
  });
});

export const UnmappedImportServiceLive = Layer.effect(
  UnmappedImportService,
  makeUnmappedImportService,
);
