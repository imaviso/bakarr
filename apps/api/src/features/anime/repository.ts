import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import { inferAiredAt } from "../../lib/anime-derivations.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { AnimeNotFoundError, AnimeStoredDataError } from "./errors.ts";

type EpisodeWriteDb = Pick<AppDatabase, "insert" | "select" | "update">;
type NowIso = () => Effect.Effect<string>;

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

export const getAnimeRowEffect = Effect.fn("AnimeRepository.getAnimeRow")(function* (
  db: AppDatabase,
  animeId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load anime", () =>
    db.select().from(anime).where(eq(anime.id, animeId)).limit(1),
  );
  const [row] = rows;
  if (!row) {
    return yield* new AnimeNotFoundError({ message: "Anime not found" });
  }
  return row;
});

export const requireAnimeExistsEffect = Effect.fn("AnimeRepository.requireAnimeExists")(function* (
  db: AppDatabase,
  animeId: number,
) {
  yield* getAnimeRowEffect(db, animeId);
});

export const getEpisodeRowEffect = Effect.fn("AnimeRepository.getEpisodeRow")(function* (
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load episode", () =>
    db
      .select()
      .from(episodes)
      .where(and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)))
      .limit(1),
  );
  const [row] = rows;
  if (!row) {
    return yield* new AnimeNotFoundError({ message: "Episode not found" });
  }
  return row;
});

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

  if (rows[0]) {
    yield* tryDatabasePromise("Failed to upsert episode", () =>
      db
        .update(episodes)
        .set(buildEpisodePatchSet(patch, rows[0]))
        .where(eq(episodes.id, rows[0].id)),
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

  if (!existingRows[0]) {
    return yield* new AnimeStoredDataError({
      message: "Failed to upsert episode",
    });
  }

  yield* tryDatabasePromise("Failed to upsert episode", () =>
    db
      .update(episodes)
      .set(buildEpisodePatchSet(patch, existingRows[0]))
      .where(eq(episodes.id, existingRows[0].id)),
  );
});

export const ensureEpisodesEffect = Effect.fn("AnimeRepository.ensureEpisodes")(function* (
  db: AppDatabase,
  animeId: number,
  episodeCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  resetMissingOnly: boolean,
  nowIso: NowIso,
) {
  const now = yield* nowIso();
  const existingRows =
    !episodeCount || episodeCount <= 0
      ? []
      : yield* tryDatabasePromise("Failed to ensure episodes", () =>
          db.select().from(episodes).where(eq(episodes.animeId, animeId)),
        );
  const missingRows = buildMissingEpisodeRows({
    animeId,
    episodeCount,
    endDate,
    existingRows,
    futureAiringSchedule,
    nowIso: now,
    resetMissingOnly,
    startDate,
    status,
  });

  if (missingRows.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to ensure episodes", () =>
    db.insert(episodes).values(missingRows),
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

export interface FutureAiringScheduleEntry {
  readonly airingAt: string;
  readonly episode: number;
}

export function buildAiringScheduleMap(
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
) {
  return new Map((futureAiringSchedule ?? []).map((entry) => [entry.episode, entry.airingAt]));
}

export const updateAnimeEpisodeAirDatesEffect = Effect.fn(
  "AnimeRepository.updateAnimeEpisodeAirDates",
)(function* (
  db: AppDatabase,
  animeId: number,
  episodeCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  nowIso: NowIso,
) {
  if (!episodeCount || episodeCount <= 0) {
    return;
  }

  const existingRows = yield* tryDatabasePromise("Failed to update anime episode air dates", () =>
    db.select().from(episodes).where(eq(episodes.animeId, animeId)),
  );
  const scheduleMap = buildAiringScheduleMap(futureAiringSchedule);
  const now = yield* nowIso();

  for (const row of existingRows) {
    const inferred = inferAiredAt(
      status,
      row.number,
      episodeCount,
      startDate,
      endDate,
      scheduleMap,
      now,
    );

    if (row.aired === inferred) {
      continue;
    }

    yield* tryDatabasePromise("Failed to update anime episode air dates", () =>
      db.update(episodes).set({ aired: inferred }).where(eq(episodes.id, row.id)),
    );
  }
});

export const findAnimeRootFolderOwnerEffect = Effect.fn("AnimeRepository.findAnimeRootFolderOwner")(
  function* (db: AppDatabase, rootFolder: string) {
    const normalized = normalizeRootFolder(rootFolder);
    const rows = yield* tryDatabasePromise("Failed to find anime root folder owner", () =>
      db
        .select({
          id: anime.id,
          rootFolder: anime.rootFolder,
          titleRomaji: anime.titleRomaji,
        })
        .from(anime),
    );

    return (
      rows.find((row) => {
        const existing = normalizeRootFolder(row.rootFolder);
        return (
          existing === normalized ||
          normalized.startsWith(`${existing}/`) ||
          existing.startsWith(`${normalized}/`)
        );
      }) ?? null
    );
  },
);

function normalizeRootFolder(rootFolder: string) {
  if (rootFolder === "/") {
    return "/";
  }

  return rootFolder.replace(/\/+$/, "");
}

export { markSearchResultsAlreadyInLibraryEffect } from "../../lib/anime-search-results.ts";
export { inferAiredAt };

export function buildMissingEpisodeRows(input: {
  animeId: number;
  episodeCount: number | undefined;
  status: string;
  startDate: string | undefined;
  endDate: string | undefined;
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined;
  nowIso?: string;
  resetMissingOnly: boolean;
  existingRows: readonly (typeof episodes.$inferSelect)[];
}) {
  if (!input.episodeCount || input.episodeCount <= 0) {
    return [] as (typeof episodes.$inferInsert)[];
  }

  const existingByNumber = new Map(input.existingRows.map((row) => [row.number, row]));
  const airingScheduleByEpisode = buildAiringScheduleMap(input.futureAiringSchedule);

  return range(1, input.episodeCount).flatMap((number) => {
    const existing = existingByNumber.get(number);

    if (existing) {
      if (input.resetMissingOnly && existing.downloaded) {
        return [];
      }

      return [];
    }

    return [
      {
        aired: inferAiredAt(
          input.status,
          number,
          input.episodeCount,
          input.startDate,
          input.endDate,
          airingScheduleByEpisode,
          input.nowIso,
        ),
        animeId: input.animeId,
        downloaded: false,
        filePath: null,
        number,
        title: null,
      } satisfies typeof episodes.$inferInsert,
    ];
  });
}

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

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
