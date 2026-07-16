import { Effect, Stream } from "effect";

import { DatabaseError } from "@/db/database.ts";
import {
  type FileSystemShape,
  isWithinPathRoot,
  sanitizePathSegmentEffect,
} from "@/infra/filesystem/filesystem.ts";
import { classifyMediaArtifact } from "@/infra/media/identity/identity.ts";
import { extractUnitNumbersFromFile } from "@/features/media/files/files.ts";
import { inferAiredAt } from "@/domain/media/derivations.ts";
import {
  getLibraryPathForMediaKind,
  resolveMediaRootFolderEffect,
} from "@/features/media/shared/config-support.ts";
import { decodeMediaKind } from "@/features/media/shared/media-kind.ts";
import { DomainInputError, DomainPathError, InfrastructureError } from "@/features/errors.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import {
  MediaUnitRepository,
  type MediaUnitRepositoryShape,
} from "@/features/media/units/media-unit-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import type { MediaKind } from "@packages/shared/index.ts";

export interface UnmappedImportWorkflowShape {
  readonly importUnmappedFolder: (input: {
    folder_name: string;
    media_id: number;
    profile_name?: string;
  }) => Effect.Effect<
    void,
    | DatabaseError
    | OperationsNotFoundError
    | OperationsConflictError
    | MediaNotFoundError
    | DomainInputError
    | DomainPathError
    | InfrastructureError
  >;
}

export const cleanupPreviousMediaRootFolderAfterImport = Effect.fn(
  "UnmappedImportService.cleanupPreviousMediaRootFolderAfterImport",
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

/** Test factory — production uses UnmappedImportService.Default. */
export function makeUnmappedImportWorkflow(input: {
  fs: FileSystemShape;
  getLibraryPath: (
    mediaKind: MediaKind,
  ) => Effect.Effect<string, DatabaseError | InfrastructureError>;
  mediaReadRepository: typeof MediaReadRepository.Service;
  mediaUnitRepository: MediaUnitRepositoryShape;
  nowIso: () => Effect.Effect<string>;
  systemConfigRepository: typeof SystemConfigRepository.Service;
  systemLogRepository: typeof SystemLogRepository.Service;
}) {
  const {
    fs,
    getLibraryPath,
    mediaReadRepository,
    mediaUnitRepository,
    nowIso,
    systemConfigRepository,
    systemLogRepository,
  } = input;

  type EpisodeImportMapping = {
    readonly aired: string | null;
    readonly unitNumber: number;
    readonly filePath: string;
  };

  const importUnmappedFolder = Effect.fn("UnmappedImportService.importUnmappedFolder")(
    function* (input: { folder_name: string; media_id: number; profile_name?: string }) {
      const animeRow = yield* mediaReadRepository.getMediaRow(input.media_id);
      const mediaKind = decodeMediaKind(animeRow.mediaKind);
      const libraryPath = yield* getLibraryPath(mediaKind);
      const folderName = yield* sanitizePathSegmentEffect(input.folder_name).pipe(
        Effect.mapError(
          (cause) =>
            new DomainInputError({
              cause,
              message: "folder_name must be a single folder name",
            }),
        ),
      );
      const folderPath = `${libraryPath.replace(/\/$/, "")}/${folderName}`;

      if (!isWithinPathRoot(folderPath, libraryPath)) {
        return yield* new DomainInputError({
          message: "folder_name must stay within the library root",
        });
      }

      const existingOwner = yield* mediaReadRepository.findMediaByExactRootFolder(folderPath);

      if (existingOwner && existingOwner.id !== input.media_id) {
        return yield* new OperationsConflictError({
          message: `Folder ${folderName} is already mapped to ${existingOwner.titleRomaji}`,
        });
      }

      const rootFolder = yield* resolveMediaRootFolderEffect(
        systemConfigRepository,
        folderPath,
        animeRow.titleRomaji,
        {
          mediaKind,
          useExistingRoot: true,
        },
      ).pipe(
        Effect.catchTag("StoredDataError", (e) =>
          Effect.fail(
            new InfrastructureError({
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
              new DomainPathError({
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

          const isVolumeMedia = animeRow.mediaKind !== "anime";
          const unitNumbers = extractUnitNumbersFromFile(file.name, file.path, isVolumeMedia);
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

      yield* mediaUnitRepository.setMediaRootAndMapUnits(
        input.media_id,
        {
          profileName: nextProfileName,
          rootFolder,
        },
        episodeMappings.map((mapping) => ({
          aired: mapping.aired,
          unitNumber: mapping.unitNumber,
          filePath: mapping.filePath,
        })),
      );

      yield* cleanupPreviousMediaRootFolderAfterImport(fs, animeRow.rootFolder, rootFolder);

      const imported = episodeMappings.length;

      yield* systemLogRepository.appendLog(
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

export class UnmappedImportService extends Effect.Service<UnmappedImportService>()(
  "@bakarr/api/UnmappedImportService",
  {
    // FS + media + runtime config provided by ops feature layer.
    dependencies: [
      MediaReadRepository.Default,
      MediaUnitRepository.Default,
      SystemConfigRepository.Default,
      SystemLogRepository.Default,
    ],
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem;
      const mediaReadRepository = yield* MediaReadRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const systemConfigRepository = yield* SystemConfigRepository;
      const systemLogRepository = yield* SystemLogRepository;

      return makeUnmappedImportWorkflow({
        fs,
        getLibraryPath: Effect.fn("UnmappedImportService.getLibraryPath")(function* (mediaKind) {
          const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
            Effect.mapError((error) =>
              error._tag === "DatabaseError"
                ? error
                : new InfrastructureError({
                    cause: error,
                    message: "Failed to load runtime config for unmapped import",
                  }),
            ),
          );
          return getLibraryPathForMediaKind(config.library, mediaKind);
        }),
        mediaReadRepository,
        mediaUnitRepository,
        nowIso: currentNowIso,
        systemConfigRepository,
        systemLogRepository,
      });
    }),
  },
) {}

export const UnmappedImportServiceLive = UnmappedImportService.Default;
