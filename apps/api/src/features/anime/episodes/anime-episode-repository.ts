import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type EpisodeWriteDb = Pick<AppDatabase, "insert" | "select" | "update">;

type UpsertEpisodePatch = {
  aired?: string | null;
  downloaded?: boolean;
  filePath?: string | null;
  fileSize?: number | null;
  durationSeconds?: number | null;
  groupName?: string | null;
  resolution?: string | null;
  quality?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioChannels?: string | null;
  title?: string | null;
};

export const upsertEpisodeEffect = Effect.fn("AnimeRepository.upsertEpisode")(function* (
  db: EpisodeWriteDb,
  animeId: number,
  episodeNumber: number,
  patch: UpsertEpisodePatch,
) {
  const values = buildInsertEpisodeValues(animeId, episodeNumber, patch);
  const conflictSet = buildEpisodeConflictSet(patch);

  if (Object.keys(conflictSet).length === 0) {
    yield* tryDatabasePromise("Failed to upsert episode", () =>
      db
        .insert(episodes)
        .values(values)
        .onConflictDoNothing({
          target: [episodes.animeId, episodes.number],
        }),
    );
    return;
  }

  yield* tryDatabasePromise("Failed to upsert episode", () =>
    db
      .insert(episodes)
      .values(values)
      .onConflictDoUpdate({
        target: [episodes.animeId, episodes.number],
        set: conflictSet,
      }),
  );
});

export const clearEpisodeMappingEffect = Effect.fn("AnimeRepository.clearEpisodeMapping")(
  function* (db: EpisodeWriteDb, animeId: number, episodeNumber: number) {
    yield* tryDatabasePromise("Failed to clear episode mapping", () =>
      db
        .update(episodes)
        .set({
          downloaded: false,
          filePath: null,
          fileSize: null,
          durationSeconds: null,
          groupName: null,
          resolution: null,
          quality: null,
          videoCodec: null,
          audioCodec: null,
          audioChannels: null,
        })
        .where(and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber))),
    );
  },
);

export const bulkMapEpisodeFilesAtomicEffect = Effect.fn(
  "AnimeRepository.bulkMapEpisodeFilesAtomic",
)(function* (
  db: AppDatabase,
  animeId: number,
  mappings: readonly {
    episode_number: number;
    file_path: string;
    clear: boolean;
  }[],
) {
  yield* tryDatabasePromise("Failed to bulk-map episode files", () =>
    db.transaction(async (tx) => {
      for (const entry of mappings) {
        if (entry.clear) {
          await tx
            .update(episodes)
            .set({
              downloaded: false,
              filePath: null,
              fileSize: null,
              durationSeconds: null,
              groupName: null,
              resolution: null,
              quality: null,
              videoCodec: null,
              audioCodec: null,
              audioChannels: null,
            })
            .where(and(eq(episodes.animeId, animeId), eq(episodes.number, entry.episode_number)));
          continue;
        }

        await tx
          .insert(episodes)
          .values({
            aired: null,
            animeId,
            downloaded: true,
            filePath: entry.file_path,
            number: entry.episode_number,
            title: null,
          })
          .onConflictDoUpdate({
            target: [episodes.animeId, episodes.number],
            set: {
              downloaded: true,
              filePath: entry.file_path,
            },
          });
      }
    }),
  );
});

function buildInsertEpisodeValues(
  animeId: number,
  episodeNumber: number,
  patch: UpsertEpisodePatch,
) {
  return {
    aired: patch.aired ?? null,
    animeId,
    audioChannels: patch.audioChannels ?? null,
    audioCodec: patch.audioCodec ?? null,
    downloaded: patch.downloaded ?? false,
    durationSeconds: patch.durationSeconds ?? null,
    filePath: patch.filePath ?? null,
    fileSize: patch.fileSize ?? null,
    groupName: patch.groupName ?? null,
    number: episodeNumber,
    quality: patch.quality ?? null,
    resolution: patch.resolution ?? null,
    title: patch.title ?? null,
    videoCodec: patch.videoCodec ?? null,
  } satisfies typeof episodes.$inferInsert;
}

function buildEpisodeConflictSet(patch: UpsertEpisodePatch) {
  return {
    ...(patch.aired === undefined ? {} : { aired: patch.aired }),
    ...(patch.audioChannels === undefined ? {} : { audioChannels: patch.audioChannels }),
    ...(patch.audioCodec === undefined ? {} : { audioCodec: patch.audioCodec }),
    ...(patch.downloaded === undefined ? {} : { downloaded: patch.downloaded }),
    ...(patch.durationSeconds === undefined ? {} : { durationSeconds: patch.durationSeconds }),
    ...(patch.filePath === undefined ? {} : { filePath: patch.filePath }),
    ...(patch.fileSize === undefined ? {} : { fileSize: patch.fileSize }),
    ...(patch.groupName === undefined ? {} : { groupName: patch.groupName }),
    ...(patch.quality === undefined ? {} : { quality: patch.quality }),
    ...(patch.resolution === undefined ? {} : { resolution: patch.resolution }),
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.videoCodec === undefined ? {} : { videoCodec: patch.videoCodec }),
  };
}
