import { Effect } from "effect";
import { and, eq, inArray } from "drizzle-orm";
import type { ImportMode } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { MediaProbeShape, ProbedMediaMetadata } from "@/lib/media-probe.ts";
import { OperationsAnimeNotFoundError, OperationsPathError } from "@/features/operations/errors.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import {
  currentImportMode,
  currentNamingSettings,
} from "@/features/operations/repository/config-repository.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "@/features/operations/naming-support.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export interface BuildLibraryImportPlanInput {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly file: {
    source_path: string;
    anime_id: number;
    episode_number: number;
    episode_numbers?: readonly number[];
    season?: number;
    source_metadata?: import("@packages/shared/index.ts").DownloadSourceMetadata;
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
  readonly namingPlan: ReturnType<typeof buildEpisodeFilenamePlan>;
  readonly sourcePath: string;
  readonly sourceMetadata?: import("@packages/shared/index.ts").DownloadSourceMetadata;
}

export const buildLibraryImportPlan = Effect.fn("Operations.buildLibraryImportPlan")((
  input: BuildLibraryImportPlanInput,
): Effect.Effect<
  LibraryImportPlan,
  import("@/db/database.ts").DatabaseError | OperationsPathError | OperationsAnimeNotFoundError
> => {
  const { db, file, fs, mediaProbe, tryDatabasePromise } = input;
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
    const importMode = yield* currentImportMode(db);
    const namingSettings = yield* currentNamingSettings(db);
    const namingFormat = selectNamingFormat(animeRow, namingSettings);
    const allEpisodeNumbers = file.episode_numbers?.length
      ? file.episode_numbers
      : [file.episode_number];
    const episodeRows = yield* tryDatabasePromise("Failed to import files", () =>
      db
        .select({ aired: episodes.aired, title: episodes.title })
        .from(episodes)
        .where(
          and(
            eq(episodes.animeId, file.anime_id),
            inArray(episodes.number, allEpisodeNumbers as number[]),
          ),
        ),
    );
    const extension = file.source_path.includes(".")
      ? file.source_path.slice(file.source_path.lastIndexOf("."))
      : ".mkv";
    const initialNamingPlan = buildEpisodeFilenamePlan({
      animeRow,
      downloadSourceMetadata: file.source_metadata,
      episodeNumbers: allEpisodeNumbers,
      episodeRows,
      filePath: file.source_path,
      namingFormat,
      preferredTitle: namingSettings.preferredTitle,
      season: file.season,
    });
    const localMediaMetadata = hasMissingLocalMediaNamingFields(initialNamingPlan.missingFields)
      ? yield* mediaProbe
          .probeVideoFile(file.source_path)
          .pipe(
            Effect.map((probeResult) =>
              probeResult._tag === "MediaProbeMetadataFound" ? probeResult.metadata : undefined,
            ),
          )
      : undefined;
    const namingPlan = localMediaMetadata
      ? buildEpisodeFilenamePlan({
          animeRow,
          downloadSourceMetadata: file.source_metadata,
          episodeNumbers: allEpisodeNumbers,
          episodeRows,
          filePath: file.source_path,
          localMediaMetadata,
          namingFormat,
          preferredTitle: namingSettings.preferredTitle,
          season: file.season,
        })
      : initialNamingPlan;
    const destination = `${animeRow.rootFolder.replace(/\/$/, "")}/${namingPlan.baseName}${extension}`;

    return {
      allEpisodeNumbers,
      animeRow,
      destination,
      importMode,
      episodeNumber: file.episode_number,
      localMediaMetadata,
      namingPlan,
      resolvedSource,
      sourceMetadata: file.source_metadata,
      sourcePath: file.source_path,
    } satisfies LibraryImportPlan;
  });
});
