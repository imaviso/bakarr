import { Effect } from "effect";
import { and, eq, inArray } from "drizzle-orm";
import type { Config, DownloadSourceMetadata, ImportMode } from "@packages/shared/index.ts";

import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import {
  probeMediaMetadataOrUndefined,
  type MediaProbeShape,
  type ProbedMediaMetadata,
} from "@/lib/media-probe.ts";
import { OperationsAnimeNotFoundError, OperationsPathError } from "@/features/operations/errors.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
  type EpisodeFilenamePlan,
} from "@/features/operations/naming-support.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export interface BuildLibraryImportPlanInput {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly runtimeConfig: Config;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly file: {
    source_path: string;
    anime_id: number;
    episode_number: number;
    episode_numbers?: readonly number[];
    season?: number;
    source_metadata?: DownloadSourceMetadata;
  };
}

export interface LibraryImportPlan {
  readonly allEpisodeNumbers: readonly number[];
  readonly animeRow: typeof anime.$inferSelect;
  readonly destination: string;
  readonly importMode: ImportMode;
  readonly episodeNumber: number;
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

    const animeRow = yield* requireAnime(db, file.anime_id);
    const importMode = runtimeConfig.library.import_mode;
    const namingSettings = {
      movieNamingFormat: runtimeConfig.library.movie_naming_format,
      namingFormat: runtimeConfig.library.naming_format,
      preferredTitle: runtimeConfig.library.preferred_title,
    };
    const namingFormat = selectNamingFormat(animeRow, namingSettings);
    const allEpisodeNumbers = file.episode_numbers?.length
      ? file.episode_numbers
      : [file.episode_number];
    const episodeNumbersForQuery = [...allEpisodeNumbers];
    const episodeRows = yield* tryDatabasePromise("Failed to import files", () =>
      db
        .select({ aired: episodes.aired, title: episodes.title })
        .from(episodes)
        .where(
          and(
            eq(episodes.animeId, file.anime_id),
            inArray(episodes.number, episodeNumbersForQuery),
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
      episodeNumbers: allEpisodeNumbers,
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
          episodeNumbers: allEpisodeNumbers,
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
      episodeNumber: file.episode_number,
      ...(localMediaMetadata === undefined ? {} : { localMediaMetadata }),
      namingPlan,
      resolvedSource,
      ...(file.source_metadata === undefined ? {} : { sourceMetadata: file.source_metadata }),
      sourcePath: file.source_path,
    } satisfies LibraryImportPlan;
  });
});
