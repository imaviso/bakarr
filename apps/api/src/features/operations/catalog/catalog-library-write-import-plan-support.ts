import { Effect } from "effect";
import type { Config, DownloadSourceMetadata, ImportMode } from "@packages/shared/index.ts";

import type { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import {
  probeMediaMetadataOrUndefined,
  type MediaProbeShape,
  type ProbedMediaMetadata,
} from "@/infra/media/probe.ts";
import { DomainPathError } from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import { getConfiguredLibraryPaths } from "@/features/media/shared/config-support.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { buildUnitFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import type { UnitFilenamePlan } from "@/features/operations/library/naming-types.ts";
import {
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "@/features/operations/library/naming-format-support.ts";

export interface BuildLibraryImportPlanInput {
  readonly fs: FileSystemShape;
  readonly mediaRepository: typeof MediaRepository.Service;
  readonly mediaProbe: MediaProbeShape;
  readonly runtimeConfig: Config;
  readonly file: {
    source_path: string;
    media_id: number;
    unit_number: number;
    unit_numbers?: readonly number[];
    season?: number;
    source_metadata?: DownloadSourceMetadata;
  };
}

export interface LibraryImportPlan {
  readonly allEpisodeNumbers: readonly number[];
  readonly animeRow: typeof media.$inferSelect;
  readonly destination: string;
  readonly importMode: ImportMode;
  readonly unitNumber: number;
  readonly localMediaMetadata?: ProbedMediaMetadata;
  readonly resolvedSource: string;
  readonly namingPlan: UnitFilenamePlan;
  readonly sourcePath: string;
  readonly sourceMetadata?: DownloadSourceMetadata;
}

export const buildLibraryImportPlan = Effect.fn("Operations.buildLibraryImportPlan")((
  input: BuildLibraryImportPlanInput,
): Effect.Effect<LibraryImportPlan, DatabaseError | DomainPathError | MediaNotFoundError> => {
  const { file, fs, mediaRepository, mediaProbe, runtimeConfig } = input;
  return Effect.gen(function* () {
    const resolvedSource = yield* fs.realPath(file.source_path).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: `Source path is inaccessible: ${file.source_path}`,
          }),
      ),
    );

    const allowedPrefixes = [
      ...new Set(
        [
          ...getConfiguredLibraryPaths(runtimeConfig.library),
          runtimeConfig.library.recycle_path,
          runtimeConfig.downloads.root_path,
        ]
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    ];

    if (!allowedPrefixes.some((prefix) => isWithinPathRoot(resolvedSource, prefix))) {
      return yield* new DomainPathError({
        message: "Import source path must be inside library, recycle, or downloads root",
      });
    }

    const animeRow = yield* mediaRepository.getMediaRow(file.media_id);
    const importMode = runtimeConfig.library.import_mode;
    const namingSettings = {
      movieNamingFormat: runtimeConfig.library.movie_naming_format,
      namingFormat: runtimeConfig.library.naming_format,
      preferredTitle: runtimeConfig.library.preferred_title,
    };
    const namingFormat = selectNamingFormat(animeRow, namingSettings);
    const allEpisodeNumbers = file.unit_numbers?.length ? file.unit_numbers : [file.unit_number];
    const episodeNumbersForQuery = new Set(allEpisodeNumbers);
    const unitRows = yield* mediaRepository.listUnitRowsByMediaId(file.media_id);
    const episodeRows = unitRows
      .filter((row) => episodeNumbersForQuery.has(row.number))
      .map((row) => ({ aired: row.aired, title: row.title }));
    const sourceBaseName = file.source_path.split(/[\\/]/).pop() ?? file.source_path;
    const extension = sourceBaseName.includes(".")
      ? sourceBaseName.slice(sourceBaseName.lastIndexOf("."))
      : ".mkv";
    const initialNamingPlan = buildUnitFilenamePlan({
      animeRow,
      ...(file.source_metadata === undefined
        ? {}
        : { downloadSourceMetadata: file.source_metadata }),
      unitNumbers: allEpisodeNumbers,
      episodeRows,
      filePath: file.source_path,
      namingFormat,
      preferredTitle: namingSettings.preferredTitle,
      ...(file.season === undefined ? {} : { season: file.season }),
    });
    const localMediaMetadata = hasMissingLocalMediaNamingFields(initialNamingPlan.missingFields)
      ? yield* probeMediaMetadataOrUndefined(mediaProbe, file.source_path)
      : undefined;
    const namingPlan = localMediaMetadata
      ? buildUnitFilenamePlan({
          animeRow,
          ...(file.source_metadata === undefined
            ? {}
            : { downloadSourceMetadata: file.source_metadata }),
          unitNumbers: allEpisodeNumbers,
          episodeRows,
          filePath: file.source_path,
          localMediaMetadata,
          namingFormat,
          preferredTitle: namingSettings.preferredTitle,
          ...(file.season === undefined ? {} : { season: file.season }),
        })
      : initialNamingPlan;
    const destination = `${animeRow.rootFolder.replace(/\/$/, "")}/${namingPlan.baseName}${extension}`;

    if (!isWithinPathRoot(destination, animeRow.rootFolder)) {
      return yield* new DomainPathError({
        message: `Resolved destination escapes the media root folder: ${destination}`,
      });
    }

    return {
      allEpisodeNumbers,
      animeRow,
      destination,
      importMode,
      unitNumber: file.unit_number,
      ...(localMediaMetadata === undefined ? {} : { localMediaMetadata }),
      namingPlan,
      resolvedSource,
      ...(file.source_metadata === undefined ? {} : { sourceMetadata: file.source_metadata }),
      sourcePath: file.source_path,
    } satisfies LibraryImportPlan;
  });
});
