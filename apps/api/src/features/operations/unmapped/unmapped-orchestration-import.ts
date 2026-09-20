import { Array, Context, Effect, Layer, Stream } from "effect";
import { DatabaseError } from "@/db/database.ts";
import {
  type FileSystemShape,
  isWithinPathRoot,
  sanitizePathSegmentEffect,
} from "@/infra/filesystem/filesystem.ts";
import { classifyMediaArtifact } from "@/features/media/identity/identity.ts";
import { extractUnitNumbersFromFile } from "@/features/media/files/files.ts";
import { inferAiredAt } from "@/features/media/shared/derivations.ts";
import {
  getLibraryPathForMediaKind,
  resolveMediaRootFolderEffect,
} from "@/features/media/shared/config-support.ts";
import { decodeStoredMediaKindEffect } from "@/features/media/shared/media-kind.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import {
  DomainInputError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
} from "@/features/errors.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import type {
  AniDbRuntimeConfigError,
  MediaConflictError,
  MediaNotFoundError,
} from "@/features/media/errors.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import {
  MediaUnitRepository,
  type MediaUnitRepositoryShape,
} from "@/features/media/units/media-unit-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import type { MediaKind, MediaIdSpace } from "@packages/shared/index.ts";
import { MEDIA_KIND_VALUES } from "@packages/shared/index.ts";
import { MediaEnrollmentService } from "@/features/media/add/media-enrollment-service.ts";
import { buildFolderMatchEnrollmentInput } from "@/features/operations/unmapped/unmapped-folder-add-policy.ts";

export interface UnmappedImportWorkflowShape {
  readonly importUnmappedFolder: (input: {
    folder_name: string;
    /** Library media id when the candidate is already enrolled. */
    media_id?: number | undefined;
    /** AniList/MAL id to enroll first when the candidate is not in the library. */
    candidate_id?: number | undefined;
    candidate_id_space?: MediaIdSpace | undefined;
    candidate_media_kind?: MediaKind | undefined;
    profile_name?: string;
  }) => Effect.Effect<
    void,
    | DatabaseError
    | OperationsNotFoundError
    | OperationsConflictError
    | MediaNotFoundError
    | MediaConflictError
    | ExternalCallError
    | StoredDataError
    | AniDbRuntimeConfigError
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

  const previousEntries = yield* Effect.result(fs.readDir(previousRootFolder));

  if (previousEntries._tag === "Failure") {
    yield* Effect.logWarning("Skipped previous media folder cleanup after import").pipe(
      Effect.annotateLogs({
        error: globalThis.String(previousEntries.failure),
        folder_path: previousRootFolder,
      }),
    );
    return;
  }

  if (previousEntries.success.length === 0) {
    yield* fs.remove(previousRootFolder, { recursive: true }).pipe(
      Effect.catchTag("FileSystemError", (fsError) =>
        Effect.logWarning("Failed to remove empty media folder after import").pipe(
          Effect.annotateLogs({
            error: globalThis.String(fsError),
            folder_path: previousRootFolder,
          }),
          Effect.asVoid,
        ),
      ),
    );
  }
});

function buildUnmappedImportWorkflow(input: {
  enrollmentService: Pick<typeof MediaEnrollmentService.Service, "enroll">;
  fs: FileSystemShape;
  getLibraryPath: (
    mediaKind: MediaKind,
  ) => Effect.Effect<string, DatabaseError | InfrastructureError>;
  mediaRepository: typeof MediaRepository.Service;
  mediaUnitRepository: MediaUnitRepositoryShape;
  nowIso: () => Effect.Effect<string>;
  systemConfigRepository: typeof SystemConfigRepository.Service;
  systemLogRepository: typeof SystemLogRepository.Service;
}) {
  const {
    enrollmentService,
    fs,
    getLibraryPath,
    mediaRepository,
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

  /** Resolve the library path a folder name belongs to (any media kind). */
  const resolveFolderLibraryPath = Effect.fn(
    "UnmappedImportService.resolveFolderLibraryPath",
  )(function* (folderName: string) {
    for (const mediaKind of MEDIA_KIND_VALUES) {
      const libraryPath = yield* getLibraryPath(mediaKind);
      const candidatePath = `${libraryPath.replace(/\/$/, "")}/${folderName}`;
      const stats = yield* Effect.result(fs.stat(candidatePath));
      if (stats._tag === "Success") {
        return candidatePath;
      }
    }
    return yield* new DomainInputError({
      message: `Folder not found in any library root: ${folderName}`,
    });
  });

  const importUnmappedFolder = Effect.fn("UnmappedImportService.importUnmappedFolder")(
    function* (input: {
      folder_name: string;
      media_id?: number | undefined;
      candidate_id?: number | undefined;
      candidate_id_space?: MediaIdSpace | undefined;
      candidate_media_kind?: MediaKind | undefined;
      profile_name?: string;
    }) {
      // Enrollment path: the candidate is not in the library yet. The server
      // owns the add policy (monitored, monitor-and-search, root handling).
      const resolvedMediaId = yield* Effect.gen(function* () {
        if (input.media_id !== undefined) {
          return input.media_id;
        }

        if (input.candidate_id === undefined) {
          return yield* new DomainInputError({
            message: "Either media_id or candidate_id is required",
          });
        }

        // The folder path doubles as the new media's root folder: the folder
        // lives under the library root already, so reuse it as-is.
        const targetLibraryPath = yield* resolveFolderLibraryPath(input.folder_name);
        const enrolled = yield* enrollmentService.enroll(
          buildFolderMatchEnrollmentInput({
            candidateId: input.candidate_id,
            candidateIdSpace: input.candidate_id_space,
            candidateMediaKind: input.candidate_media_kind,
            profileName: input.profile_name?.trim() || "Default",
            rootFolder: targetLibraryPath,
          }),
        );
        return enrolled.id;
      });

      const animeRow = yield* mediaRepository.getMediaRow(resolvedMediaId);
      const mediaKind = yield* decodeStoredMediaKindEffect(animeRow.mediaKind).pipe(
        Effect.catchTag("StoredDataError", (e) =>
          Effect.fail(
            new InfrastructureError({
              message: "Failed to import unmapped folder",
              cause: e,
            }),
          ),
        ),
      );
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

      const existingOwner = yield* mediaRepository.findMediaByExactRootFolder(folderPath);

      if (existingOwner && existingOwner.id !== resolvedMediaId) {
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
      const episodeMappings = yield* scanVideoFilesStream(fs, folderPath).pipe(
        Stream.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: `Folder is inaccessible: ${folderPath}`,
            }),
        ),
        Stream.runFold(
          () => Array.empty<EpisodeImportMapping>(),
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
        ),
      );

      yield* mediaUnitRepository.setMediaRootAndMapUnits(
        resolvedMediaId,
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
        `Mapped ${folderName} as the root folder for media ${resolvedMediaId} and imported ${imported} episode(s)`,
        nowIso,
      );
      return undefined;
    },
  );

  return {
    importUnmappedFolder,
  } satisfies UnmappedImportWorkflowShape;
}

export class UnmappedImportService extends Context.Service<
  UnmappedImportService,
  UnmappedImportWorkflowShape
>()("@bakarr/api/UnmappedImportService") {
  static readonly layer = Layer.effect(
    UnmappedImportService,
    Effect.gen(function* () {
      const enrollmentService = yield* MediaEnrollmentService;
      const fs = yield* FileSystem;
      const mediaRepository = yield* MediaRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const systemConfigRepository = yield* SystemConfigRepository;
      const systemLogRepository = yield* SystemLogRepository;

      return buildUnmappedImportWorkflow({
        enrollmentService,
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
        mediaRepository,
        mediaUnitRepository,
        nowIso: currentNowIso,
        systemConfigRepository,
        systemLogRepository,
      });
    }),
  );
}

export const UnmappedImportServiceLive = UnmappedImportService.layer;

/** Test factory — production uses UnmappedImportService.layer. */
export const makeUnmappedImportWorkflow = buildUnmappedImportWorkflow;
