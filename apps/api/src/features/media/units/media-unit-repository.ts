import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { inferAiredAt } from "@/domain/media/derivations.ts";
import type { AnimeMetadataEpisode } from "@/features/media/metadata/anilist-model.ts";
import {
  buildMissingEpisodeRows,
  type FutureAiringScheduleEntry,
} from "@/features/media/units/media-schedule-repository.ts";
import {
  clampInferredEpisodeUpperBound,
  MAX_INFERRED_EPISODE_NUMBER,
} from "@/features/media/units/unit-backfill-policy.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export type UpsertEpisodePatch = {
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

export type BulkMapEpisodeEntry = {
  unit_number: number;
  file_path: string;
  clear: boolean;
};

export type UnitFileMapping = {
  readonly unitNumber: number;
  readonly filePath: string;
  readonly aired?: string | null;
};

export class UpsertEpisodeFileError extends Schema.TaggedError<UpsertEpisodeFileError>()(
  "UpsertEpisodeFileError",
  {
    media_id: Schema.Number,
    unit_number: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export interface MediaUnitRepositoryShape {
  readonly upsertEpisode: (
    mediaId: number,
    unitNumber: number,
    patch: UpsertEpisodePatch,
  ) => Effect.Effect<void, DatabaseError>;
  readonly clearEpisodeMapping: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<void, DatabaseError>;
  readonly bulkMapEpisodeFiles: (
    mediaId: number,
    mappings: readonly BulkMapEpisodeEntry[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly upsertEpisodeFiles: (
    mediaId: number,
    unitNumbers: readonly number[],
    destination: string,
  ) => Effect.Effect<void, DatabaseError | UpsertEpisodeFileError>;
  readonly updateUnitFilePaths: (
    mediaId: number,
    unitNumbers: readonly number[],
    filePath: string,
  ) => Effect.Effect<void, DatabaseError>;
  readonly upsertUnitMappings: (
    mediaId: number,
    mappings: readonly UnitFileMapping[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly setMediaRootAndMapUnits: (
    mediaId: number,
    patch: { readonly profileName: string; readonly rootFolder: string },
    mappings: readonly UnitFileMapping[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly ensureEpisodes: <E>(
    mediaId: number,
    unitCount: number | undefined,
    status: string,
    startDate: string | undefined,
    endDate: string | undefined,
    futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
    resetMissingOnly: boolean,
    nowIso: () => Effect.Effect<string, E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly updateEpisodeAirDates: <E>(
    mediaId: number,
    unitCount: number | undefined,
    status: string,
    startDate: string | undefined,
    endDate: string | undefined,
    futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
    nowIso: () => Effect.Effect<string, E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly syncEpisodeMetadata: (
    mediaId: number,
    episodeMetadata: ReadonlyArray<AnimeMetadataEpisode> | undefined,
  ) => Effect.Effect<void, DatabaseError>;
  readonly syncEpisodeSchedule: <E>(
    mediaId: number,
    nextAnimeRow: {
      readonly unitCount: number | null;
      readonly status: string;
      readonly startDate: string | null;
      readonly endDate: string | null;
    },
    futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
    nowIso: () => Effect.Effect<string, E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly backfillFromNextAiring: (input: {
    readonly mediaId?: number;
    readonly monitoredOnly: boolean;
  }) => Effect.Effect<void, DatabaseError>;
}

export class MediaUnitRepository extends Effect.Service<MediaUnitRepository>()(
  "@bakarr/api/MediaUnitRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeMediaUnitRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

function makeMediaUnitRepositoryShape(db: AppDatabase): MediaUnitRepositoryShape {
  return {
    upsertEpisode: (mediaId, unitNumber, patch) => upsertEpisode(db, mediaId, unitNumber, patch),
    clearEpisodeMapping: (mediaId, unitNumber) => clearEpisodeMapping(db, mediaId, unitNumber),
    bulkMapEpisodeFiles: (mediaId, mappings) => bulkMapEpisodeFiles(db, mediaId, mappings),
    upsertEpisodeFiles: (mediaId, unitNumbers, destination) =>
      upsertEpisodeFiles(db, mediaId, unitNumbers, destination),
    updateUnitFilePaths: (mediaId, unitNumbers, filePath) =>
      updateUnitFilePaths(db, mediaId, unitNumbers, filePath),
    upsertUnitMappings: (mediaId, mappings) => upsertUnitMappings(db, mediaId, mappings),
    setMediaRootAndMapUnits: (mediaId, patch, mappings) =>
      setMediaRootAndMapUnits(db, mediaId, patch, mappings),
    ensureEpisodes: (
      mediaId,
      unitCount,
      status,
      startDate,
      endDate,
      futureAiringSchedule,
      resetMissingOnly,
      nowIso,
    ) =>
      ensureEpisodes(
        db,
        mediaId,
        unitCount,
        status,
        startDate,
        endDate,
        futureAiringSchedule,
        resetMissingOnly,
        nowIso,
      ),
    updateEpisodeAirDates: (
      mediaId,
      unitCount,
      status,
      startDate,
      endDate,
      futureAiringSchedule,
      nowIso,
    ) =>
      updateEpisodeAirDates(
        db,
        mediaId,
        unitCount,
        status,
        startDate,
        endDate,
        futureAiringSchedule,
        nowIso,
      ),
    syncEpisodeMetadata: (mediaId, episodeMetadata) =>
      syncEpisodeMetadata(db, mediaId, episodeMetadata),
    syncEpisodeSchedule: (mediaId, nextAnimeRow, futureAiringSchedule, nowIso) =>
      syncEpisodeSchedule(db, mediaId, nextAnimeRow, futureAiringSchedule, nowIso),
    backfillFromNextAiring: (input) => backfillFromNextAiring(db, input),
  } satisfies MediaUnitRepositoryShape;
}

export function makeMediaUnitRepository(db: AppDatabase): MediaUnitRepository {
  return MediaUnitRepository.make(makeMediaUnitRepositoryShape(db));
}

const upsertEpisode = Effect.fn("MediaUnitRepository.upsertEpisode")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumber: number,
  patch: UpsertEpisodePatch,
) {
  const values = buildInsertEpisodeValues(mediaId, unitNumber, patch);
  const conflictSet = buildEpisodeConflictSet(patch);

  if (Object.keys(conflictSet).length === 0) {
    yield* tryDatabasePromise("Failed to upsert episode", () =>
      db
        .insert(mediaUnits)
        .values(values)
        .onConflictDoNothing({
          target: [mediaUnits.mediaId, mediaUnits.number],
        }),
    );
    return;
  }

  yield* tryDatabasePromise("Failed to upsert episode", () =>
    db
      .insert(mediaUnits)
      .values(values)
      .onConflictDoUpdate({
        target: [mediaUnits.mediaId, mediaUnits.number],
        set: conflictSet,
      }),
  );
});

const clearEpisodeMapping = Effect.fn("MediaUnitRepository.clearEpisodeMapping")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumber: number,
) {
  yield* tryDatabasePromise("Failed to clear episode mapping", () =>
    db
      .update(mediaUnits)
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
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber))),
  );
});

const bulkMapEpisodeFiles = Effect.fn("MediaUnitRepository.bulkMapEpisodeFiles")(function* (
  db: AppDatabase,
  mediaId: number,
  mappings: readonly BulkMapEpisodeEntry[],
) {
  yield* tryDatabasePromise("Failed to bulk-map episode files", () =>
    db.transaction(async (tx) => {
      for (const entry of mappings) {
        if (entry.clear) {
          await tx
            .update(mediaUnits)
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
            .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, entry.unit_number)));
          continue;
        }

        await tx
          .insert(mediaUnits)
          .values({
            aired: null,
            mediaId,
            downloaded: true,
            filePath: entry.file_path,
            number: entry.unit_number,
            title: null,
          })
          .onConflictDoUpdate({
            target: [mediaUnits.mediaId, mediaUnits.number],
            set: {
              downloaded: true,
              filePath: entry.file_path,
            },
          });
      }
    }),
  );
});

const upsertEpisodeFiles = Effect.fn("MediaUnitRepository.upsertEpisodeFiles")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumbers: readonly number[],
  destination: string,
) {
  if (unitNumbers.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to upsert episode files", () =>
    db.transaction(async (tx) => {
      const episodeNumbersArr = [...unitNumbers];

      const existingRows = await tx
        .select()
        .from(mediaUnits)
        .where(and(eq(mediaUnits.mediaId, mediaId), inArray(mediaUnits.number, episodeNumbersArr)));

      const existingEpisodeNumbers = new Set(existingRows.map((r) => r.number));
      const missingEpisodeNumbers = episodeNumbersArr.filter((n) => !existingEpisodeNumbers.has(n));

      if (existingEpisodeNumbers.size > 0) {
        await tx
          .update(mediaUnits)
          .set({
            downloaded: true,
            filePath: destination,
          })
          .where(
            and(
              eq(mediaUnits.mediaId, mediaId),
              inArray(mediaUnits.number, [...existingEpisodeNumbers]),
            ),
          );
      }

      if (missingEpisodeNumbers.length > 0) {
        const valuesToInsert = missingEpisodeNumbers.map((num) => ({
          aired: null,
          mediaId,
          downloaded: true,
          filePath: destination,
          number: num,
          title: null,
        }));

        await tx
          .insert(mediaUnits)
          .values(valuesToInsert)
          .onConflictDoUpdate({
            target: [mediaUnits.mediaId, mediaUnits.number],
            set: {
              downloaded: true,
              filePath: destination,
            },
          });
      }
    }),
  ).pipe(
    Effect.mapError(
      (cause) =>
        new UpsertEpisodeFileError({
          media_id: mediaId,
          unit_number: unitNumbers[0] ?? 0,
          message: cause.message,
          cause,
        }),
    ),
  );
});

const updateUnitFilePaths = Effect.fn("MediaUnitRepository.updateUnitFilePaths")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumbers: readonly number[],
  filePath: string,
) {
  if (unitNumbers.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to update unit file paths", () =>
    db
      .update(mediaUnits)
      .set({ filePath })
      .where(
        and(
          eq(mediaUnits.mediaId, mediaId),
          unitNumbers.length === 1
            ? eq(mediaUnits.number, unitNumbers[0]!)
            : inArray(mediaUnits.number, [...unitNumbers]),
        ),
      ),
  );
});

const upsertUnitMappings = Effect.fn("MediaUnitRepository.upsertUnitMappings")(function* (
  db: AppDatabase,
  mediaId: number,
  mappings: readonly UnitFileMapping[],
) {
  if (mappings.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to upsert unit mappings", () =>
    db.transaction(async (tx) => {
      for (const mapping of mappings) {
        await writeUnitMapping(tx, mediaId, mapping);
      }
    }),
  );
});

const setMediaRootAndMapUnits = Effect.fn("MediaUnitRepository.setMediaRootAndMapUnits")(function* (
  db: AppDatabase,
  mediaId: number,
  patch: { readonly profileName: string; readonly rootFolder: string },
  mappings: readonly UnitFileMapping[],
) {
  yield* tryDatabasePromise("Failed to import unmapped folder", () =>
    db.transaction(async (tx) => {
      await tx
        .update(media)
        .set({
          profileName: patch.profileName,
          rootFolder: patch.rootFolder,
        })
        .where(eq(media.id, mediaId));

      for (const mapping of mappings) {
        await writeUnitMapping(tx, mediaId, mapping);
      }
    }),
  );
});

async function writeUnitMapping(
  tx: Pick<AppDatabase, "insert">,
  mediaId: number,
  mapping: UnitFileMapping,
) {
  await tx
    .insert(mediaUnits)
    .values({
      aired: mapping.aired ?? null,
      mediaId,
      downloaded: true,
      filePath: mapping.filePath,
      number: mapping.unitNumber,
      title: null,
    })
    .onConflictDoUpdate({
      target: [mediaUnits.mediaId, mediaUnits.number],
      set: {
        downloaded: true,
        filePath: mapping.filePath,
      },
    });
}

const ensureEpisodes = Effect.fn("MediaUnitRepository.ensureEpisodes")(function* <E>(
  db: AppDatabase,
  mediaId: number,
  unitCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  resetMissingOnly: boolean,
  nowIso: () => Effect.Effect<string, E>,
) {
  const now = yield* nowIso();
  const hasFutureSchedule = Array.isArray(futureAiringSchedule) && futureAiringSchedule.length > 0;
  const existingRows =
    (!unitCount || unitCount <= 0) && !hasFutureSchedule
      ? []
      : yield* tryDatabasePromise("Failed to ensure mediaUnits", () =>
          db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)),
        );
  const missingRows = buildMissingEpisodeRows({
    mediaId,
    unitCount,
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

  yield* tryDatabasePromise("Failed to ensure mediaUnits", () =>
    db.insert(mediaUnits).values(missingRows),
  );
});

const updateEpisodeAirDates = Effect.fn("MediaUnitRepository.updateEpisodeAirDates")(function* <E>(
  db: AppDatabase,
  mediaId: number,
  unitCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  nowIso: () => Effect.Effect<string, E>,
) {
  const scheduleMap = new Map(
    (futureAiringSchedule ?? []).map((entry) => [entry.episode, entry.airingAt]),
  );
  const maxScheduledEpisode = clampInferredEpisodeUpperBound(maxEpisodeNumber(scheduleMap));

  if ((!unitCount || unitCount <= 0) && scheduleMap.size === 0) {
    return;
  }

  const existingRows = yield* tryDatabasePromise("Failed to update media episode air dates", () =>
    db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)),
  );
  const now = yield* nowIso();

  for (const row of existingRows) {
    if (
      (!unitCount || unitCount <= 0) &&
      (maxScheduledEpisode === undefined || row.number > maxScheduledEpisode)
    ) {
      continue;
    }

    const inferred = inferAiredAt(
      status,
      row.number,
      unitCount,
      startDate,
      endDate,
      scheduleMap,
      now,
    );

    if (row.aired === inferred) {
      continue;
    }

    yield* tryDatabasePromise("Failed to update media episode air dates", () =>
      db.update(mediaUnits).set({ aired: inferred }).where(eq(mediaUnits.id, row.id)),
    );
  }
});

const syncEpisodeMetadata = Effect.fn("MediaUnitRepository.syncEpisodeMetadata")(function* (
  db: AppDatabase,
  mediaId: number,
  episodeMetadata: ReadonlyArray<AnimeMetadataEpisode> | undefined,
) {
  if (!Array.isArray(episodeMetadata) || episodeMetadata.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to sync episode metadata", () =>
    db.transaction(async (tx) => {
      for (const entry of episodeMetadata) {
        const updateSet = {
          ...(entry.aired === undefined ? {} : { aired: entry.aired }),
          ...(entry.durationSeconds === undefined
            ? {}
            : { durationSeconds: entry.durationSeconds }),
          ...(entry.title === undefined ? {} : { title: entry.title }),
        };

        const insertBase = {
          aired: entry.aired ?? null,
          mediaId,
          durationSeconds: entry.durationSeconds ?? null,
          number: entry.number,
          title: entry.title ?? null,
        };

        if (Object.keys(updateSet).length === 0) {
          await tx.insert(mediaUnits).values(insertBase).onConflictDoNothing();
          continue;
        }

        await tx
          .insert(mediaUnits)
          .values(insertBase)
          .onConflictDoUpdate({
            target: [mediaUnits.mediaId, mediaUnits.number],
            set: updateSet,
          });
      }
    }),
  );
});

const syncEpisodeSchedule = Effect.fn("MediaUnitRepository.syncEpisodeSchedule")(function* <E>(
  db: AppDatabase,
  mediaId: number,
  nextAnimeRow: {
    readonly unitCount: number | null;
    readonly status: string;
    readonly startDate: string | null;
    readonly endDate: string | null;
  },
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  nowIso: () => Effect.Effect<string, E>,
) {
  yield* ensureEpisodes(
    db,
    mediaId,
    nextAnimeRow.unitCount ?? undefined,
    nextAnimeRow.status,
    nextAnimeRow.startDate ?? undefined,
    nextAnimeRow.endDate ?? undefined,
    futureAiringSchedule,
    false,
    nowIso,
  );
  yield* updateEpisodeAirDates(
    db,
    mediaId,
    nextAnimeRow.unitCount ?? undefined,
    nextAnimeRow.status,
    nextAnimeRow.startDate ?? undefined,
    nextAnimeRow.endDate ?? undefined,
    futureAiringSchedule,
    nowIso,
  );
});

const backfillFromNextAiring = Effect.fn("MediaUnitRepository.backfillFromNextAiring")(function* (
  db: AppDatabase,
  input: {
    readonly mediaId?: number;
    readonly monitoredOnly: boolean;
  },
) {
  const whereClause = and(
    input.mediaId === undefined ? undefined : eq(media.id, input.mediaId),
    input.monitoredOnly ? eq(media.monitored, true) : undefined,
    isNull(media.unitCount),
    isNotNull(media.nextAiringUnit),
    isNotNull(media.nextAiringAt),
    sql`${media.nextAiringUnit} > 1`,
  );

  const candidates = yield* tryDatabasePromise(
    "Failed to load next-airing backfill candidates",
    () =>
      db
        .select({
          id: media.id,
          nextAiringAt: media.nextAiringAt,
          nextAiringUnit: media.nextAiringUnit,
        })
        .from(media)
        .where(whereClause),
  );

  if (candidates.length === 0) {
    return;
  }

  const candidateIds = candidates.map((candidate) => candidate.id);
  const existingRows = yield* tryDatabasePromise(
    "Failed to load existing mediaUnits for backfill",
    () =>
      db
        .select({
          mediaId: mediaUnits.mediaId,
          number: mediaUnits.number,
        })
        .from(mediaUnits)
        .where(
          and(
            inArray(mediaUnits.mediaId, candidateIds),
            gte(mediaUnits.number, 1),
            lte(mediaUnits.number, MAX_INFERRED_EPISODE_NUMBER),
          ),
        ),
  );

  const existingByAnimeId = new Map<number, Set<number>>();

  for (const row of existingRows) {
    const numbers = existingByAnimeId.get(row.mediaId);

    if (numbers) {
      numbers.add(row.number);
      continue;
    }

    existingByAnimeId.set(row.mediaId, new Set([row.number]));
  }

  const rowsToInsert: (typeof mediaUnits.$inferInsert)[] = [];

  for (const candidate of candidates) {
    const nextAiringUnit = candidate.nextAiringUnit;
    const nextAiringAt = candidate.nextAiringAt;

    if (!nextAiringUnit || !nextAiringAt) {
      continue;
    }

    const upperBound = clampInferredEpisodeUpperBound(nextAiringUnit - 1);

    if (upperBound === undefined) {
      continue;
    }

    const existingNumbers = existingByAnimeId.get(candidate.id) ?? new Set<number>();
    const scheduleMap = new Map<number, string>([[nextAiringUnit, nextAiringAt]]);

    const missingRows = range(1, upperBound).flatMap((unitNumber) => {
      if (existingNumbers.has(unitNumber)) {
        return [];
      }

      const aired = inferAiredAt(
        "RELEASING",
        unitNumber,
        undefined,
        undefined,
        undefined,
        scheduleMap,
      );

      if (aired === null) {
        return [];
      }

      return [
        {
          aired,
          mediaId: candidate.id,
          downloaded: false,
          filePath: null,
          number: unitNumber,
          title: null,
        } satisfies typeof mediaUnits.$inferInsert,
      ];
    });

    if (missingRows.length === 0) {
      continue;
    }

    rowsToInsert.push(...missingRows);
  }

  if (rowsToInsert.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to backfill mediaUnits from next airing", () =>
    db.insert(mediaUnits).values(rowsToInsert).onConflictDoNothing(),
  );
});

function buildInsertEpisodeValues(mediaId: number, unitNumber: number, patch: UpsertEpisodePatch) {
  return {
    aired: patch.aired ?? null,
    mediaId,
    audioChannels: patch.audioChannels ?? null,
    audioCodec: patch.audioCodec ?? null,
    downloaded: patch.downloaded ?? false,
    durationSeconds: patch.durationSeconds ?? null,
    filePath: patch.filePath ?? null,
    fileSize: patch.fileSize ?? null,
    groupName: patch.groupName ?? null,
    number: unitNumber,
    quality: patch.quality ?? null,
    resolution: patch.resolution ?? null,
    title: patch.title ?? null,
    videoCodec: patch.videoCodec ?? null,
  } satisfies typeof mediaUnits.$inferInsert;
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

function maxEpisodeNumber(scheduleMap: ReadonlyMap<number, string>) {
  let max: number | undefined;

  for (const unitNumber of scheduleMap.keys()) {
    if (max === undefined || unitNumber > max) {
      max = unitNumber;
    }
  }

  return max;
}

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
