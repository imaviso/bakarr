import { Effect } from "effect";
import { and, eq, inArray } from "drizzle-orm";
import type { Config, DownloadSourceMetadata, ImportMode } from "@packages/shared/index.ts";

import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import {
  probeMediaMetadataOrUndefined,
  type MediaProbeShape,
  type ProbedMediaMetadata,
} from "@/infra/media/probe.ts";
import { OperationsAnimeNotFoundError, OperationsPathError } from "@/features/operations/errors.ts";
import { getAnimeRowEffect as requireAnime } from "@/features/media/shared/media-read-repository.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import type { EpisodeFilenamePlan } from "@/features/operations/library/naming-types.ts";
import {
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "@/features/operations/library/naming-format-support.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export interface BuildLibraryImportPlanInput {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly runtimeConfig: Config;
  readonly tryDatabasePromise: TryDatabasePromise;
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
  readonly namingPlan: EpisodeFilenamePlan;
  readonly sourcePath: string;
  readonly sourceMetadata?: DownloadSourceMetadata;
}

export const buildLibraryImportPlan = Effect.fn("Operations.buildLibraryImportPlan")((
  input: BuildLibraryImportPlanInput,
): Effect.Effect<
  LibraryImportPlan,
  DatabaseError | OperationsPathError | OperationsAnimeNotFoundError
> => {
  const { db, file, fs, mediaProbe, runtimeConfig, tryDatabasePromise } = input;
  return Effect.gen(function* () {
    const resolvedSource = yield* fs.realPath(file.source_path).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsPathError({
            cause,
            message: `Source path is inaccessible: ${file.source_path}`,
          }),
      ),
    );

    const animeRow = yield* requireAnime(db, file.media_id);
    const importMode = runtimeConfig.library.import_mode;
    const namingSettings = {
      movieNamingFormat: runtimeConfig.library.movie_naming_format,
      namingFormat: runtimeConfig.library.naming_format,
      preferredTitle: runtimeConfig.library.preferred_title,
    };
    const namingFormat = selectNamingFormat(animeRow, namingSettings);
    const allEpisodeNumbers = file.unit_numbers?.length ? file.unit_numbers : [file.unit_number];
    const episodeNumbersForQuery = [...allEpisodeNumbers];
    const episodeRows = yield* tryDatabasePromise("Failed to import files", () =>
      db
        .select({ aired: mediaUnits.aired, title: mediaUnits.title })
        .from(mediaUnits)
        .where(
          and(
            eq(mediaUnits.mediaId, file.media_id),
            inArray(mediaUnits.number, episodeNumbersForQuery),
          ),
        ),
    );
    const extension = file.source_path.includes(".")
      ? file.source_path.slice(file.source_path.lastIndexOf("."))
      : ".mkv";
    const initialNamingPlan = buildEpisodeFilenamePlan({
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
      ? buildEpisodeFilenamePlan({
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
