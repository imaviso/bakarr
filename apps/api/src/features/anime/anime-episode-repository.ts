import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";

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
  const rows = yield* tryDatabasePromise("Failed to upsert episode", () =>
    db
      .select()
      .from(episodes)
      .where(and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)))
      .limit(1),
  );

  const existingRow = rows[0];

  if (existingRow) {
    yield* tryDatabasePromise("Failed to upsert episode", () =>
      db
        .update(episodes)
        .set(buildEpisodePatchSet(patch, existingRow))
        .where(eq(episodes.id, existingRow.id)),
    );
    return;
  }

  const insertResult = yield* Effect.either(
    tryDatabasePromise("Failed to upsert episode", () =>
      db.insert(episodes).values({
        aired: patch.aired ?? null,
        animeId,
        downloaded: patch.downloaded ?? false,
        filePath: patch.filePath ?? null,
        fileSize: patch.fileSize ?? null,
        durationSeconds: patch.durationSeconds ?? null,
        groupName: patch.groupName ?? null,
        resolution: patch.resolution ?? null,
        quality: patch.quality ?? null,
        videoCodec: patch.videoCodec ?? null,
        audioCodec: patch.audioCodec ?? null,
        audioChannels: patch.audioChannels ?? null,
        number: episodeNumber,
        title: patch.title ?? null,
      }),
    ),
  );

  if (insertResult._tag === "Right") {
    return;
  }

  const existingRows = yield* tryDatabasePromise("Failed to upsert episode", () =>
    db
      .select()
      .from(episodes)
      .where(and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)))
      .limit(1),
  );

  const conflictRow = existingRows[0];

  if (!conflictRow) {
    return yield* new AnimeStoredDataError({
      message: "Failed to upsert episode",
    });
  }

  yield* tryDatabasePromise("Failed to upsert episode", () =>
    db
      .update(episodes)
      .set(buildEpisodePatchSet(patch, conflictRow))
      .where(eq(episodes.id, conflictRow.id)),
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

function buildEpisodePatchSet(patch: UpsertEpisodePatch, existing: typeof episodes.$inferSelect) {
  return {
    aired: patch.aired ?? existing.aired,
    audioChannels: patch.audioChannels ?? existing.audioChannels,
    audioCodec: patch.audioCodec ?? existing.audioCodec,
    downloaded: patch.downloaded ?? existing.downloaded,
    durationSeconds: patch.durationSeconds ?? existing.durationSeconds,
    filePath: patch.filePath ?? existing.filePath,
    fileSize: patch.fileSize ?? existing.fileSize,
    groupName: patch.groupName ?? existing.groupName,
    quality: patch.quality ?? existing.quality,
    resolution: patch.resolution ?? existing.resolution,
    title: patch.title ?? existing.title,
    videoCodec: patch.videoCodec ?? existing.videoCodec,
  };
}
