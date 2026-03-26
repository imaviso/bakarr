import { and, eq, inArray } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, appConfig, episodes, qualityProfiles, systemLogs } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { effectDecodeConfigCore, effectDecodeImagePath } from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import { AnimeNotFoundError } from "./errors.ts";

type EpisodeWriteDb = Pick<AppDatabase, "insert" | "select" | "update">;
type NowIso = () => Effect.Effect<string>;

export class UpsertEpisodeError extends Schema.TaggedError<UpsertEpisodeError>()(
  "UpsertEpisodeError",
  {
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

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
    return yield* new UpsertEpisodeError({
      anime_id: animeId,
      episode_number: episodeNumber,
      message: "Failed to upsert episode",
      cause: insertResult.left,
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

export const resolveAnimeRootFolderEffect = Effect.fn("AnimeRepository.resolveAnimeRootFolder")(
  function* (
    db: AppDatabase,
    requestedRootFolder: string,
    title: string,
    options: { readonly useExistingRoot?: boolean } = {},
  ) {
    const trimmed = requestedRootFolder.trim();
    const rows = yield* tryDatabasePromise("Failed to resolve anime root folder", () =>
      db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
    );
    const configCore = rows[0]
      ? yield* effectDecodeConfigCore(rows[0].data)
      : makeDefaultConfig(":memory:");
    const settings = toLibrarySettings(configCore);
    const baseRootFolder = trimmed.length > 0 ? trimmed : settings.libraryPath;

    if (options.useExistingRoot && trimmed.length > 0) {
      return trimmed;
    }

    if (!settings.createAnimeFolders) {
      return baseRootFolder;
    }

    const safeSegment = toSafePathSegment(title);

    if (baseRootFolder.split("/").filter(Boolean).pop() === safeSegment) {
      return baseRootFolder;
    }

    return `${baseRootFolder.replace(/\/$/, "")}/${safeSegment}`;
  },
);

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

export const markSearchResultsAlreadyInLibraryEffect = Effect.fn(
  "AnimeRepository.markSearchResultsAlreadyInLibrary",
)(function* (db: AppDatabase, results: readonly AnimeSearchResult[]) {
  const ids = [...new Set(results.map((result) => result.id))];

  if (ids.length === 0) {
    return [...results];
  }

  const rows = yield* tryDatabasePromise("Failed to mark search results in library", () =>
    db.select({ id: anime.id }).from(anime).where(inArray(anime.id, ids)),
  );
  const libraryIds = new Set(rows.map((row) => row.id));

  return results.map((result) => ({
    ...result,
    already_in_library: libraryIds.has(result.id),
  }));
});

export const qualityProfileExistsEffect = Effect.fn("AnimeRepository.qualityProfileExists")(
  function* (db: AppDatabase, name: string) {
    const rows = yield* tryDatabasePromise("Failed to verify quality profile", () =>
      db
        .select({ name: qualityProfiles.name })
        .from(qualityProfiles)
        .where(eq(qualityProfiles.name, name))
        .limit(1),
    );
    return rows.length > 0;
  },
);

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

export const getConfiguredImagesPathEffect = Effect.fn("AnimeRepository.getConfiguredImagesPath")(
  function* (db: AppDatabase) {
    const rows = yield* tryDatabasePromise("Failed to load configured images path", () =>
      db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
    );

    return yield* effectDecodeImagePath(rows[0]);
  },
);

export const appendAnimeLogEffect = Effect.fn("AnimeRepository.appendAnimeLog")(function* (
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
  nowIso: NowIso,
) {
  const createdAt = yield* nowIso();
  yield* tryDatabasePromise("Failed to append anime log", () =>
    db.insert(systemLogs).values({
      createdAt,
      details: null,
      eventType,
      level,
      message,
    }),
  );
});

export const insertAnimeAggregateAtomicEffect = Effect.fn(
  "AnimeRepository.insertAnimeAggregateAtomic",
)(function* (
  db: AppDatabase,
  input: {
    animeRow: typeof anime.$inferInsert;
    episodeRows: readonly (typeof episodes.$inferInsert)[];
    log: typeof systemLogs.$inferInsert;
  },
) {
  yield* tryDatabasePromise("Failed to insert anime aggregate", () =>
    db.transaction(async (tx) => {
      await tx.insert(anime).values(input.animeRow);

      if (input.episodeRows.length > 0) {
        await tx.insert(episodes).values([...input.episodeRows]);
      }

      await tx.insert(systemLogs).values(input.log);
    }),
  );
});

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

export function inferAiredAt(
  status: string,
  episodeNumber: number,
  episodeCount: number | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule?: ReadonlyMap<number, string>,
  fallbackNowIso?: string,
) {
  const scheduledAiringAt = futureAiringSchedule?.get(episodeNumber);

  if (scheduledAiringAt) {
    return scheduledAiringAt;
  }

  if (!startDate) {
    return status === "FINISHED" ? (fallbackNowIso ?? null) : null;
  }

  const start = new Date(`${startDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime())) {
    return status === "FINISHED" ? (fallbackNowIso ?? null) : null;
  }

  if (status === "FINISHED" && endDate && episodeCount && episodeCount > 1) {
    const end = new Date(`${endDate}T00:00:00Z`);

    if (!Number.isNaN(end.getTime())) {
      const spanMs = Math.max(end.getTime() - start.getTime(), 0);
      const intervalMs = episodeCount > 1 ? Math.floor(spanMs / (episodeCount - 1)) : 0;
      return new Date(start.getTime() + intervalMs * (episodeNumber - 1)).toISOString();
    }
  }

  const weeklyMs = 7 * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() + weeklyMs * (episodeNumber - 1)).toISOString();
}

function toLibrarySettings(config: {
  downloads: { create_anime_folders: boolean };
  library: { library_path: string };
}) {
  return {
    createAnimeFolders: config.downloads.create_anime_folders,
    libraryPath: config.library.library_path.trim() || "./library",
  };
}

function toSafePathSegment(value: string) {
  return (
    value
      .replace(/[<>:"/\\|?*]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "anime"
  );
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
