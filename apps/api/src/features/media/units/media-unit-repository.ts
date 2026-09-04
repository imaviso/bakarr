import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import type { SQL } from "drizzle-orm";
import { Context, Effect, Layer, Record, Schema } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { inferAiredAt } from "@/features/media/shared/derivations.ts";
import type { AnimeMetadataEpisode } from "@/features/media/metadata/anilist-model.ts";
import {
  buildMissingEpisodeRows,
  type FutureAiringScheduleEntry,
} from "@/features/media/units/media-schedule-repository.ts";
import {
  clampInferredEpisodeUpperBound,
  MAX_INFERRED_EPISODE_NUMBER,
} from "@/features/media/units/unit-backfill-policy.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";

export type UpsertUnitPatch = {
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

export type BulkMapUnitEntry = {
  unit_number: number;
  file_path: string;
  clear: boolean;
};

export type UnitFileMapping = {
  readonly unitNumber: number;
  readonly filePath: string;
  readonly aired?: string | null;
};

export class UpsertUnitFileError extends Schema.TaggedError<UpsertUnitFileError>()(
  "UpsertUnitFileError",
  {
    media_id: Schema.Number,
    unit_number: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export interface MediaUnitRepositoryShape {
  readonly upsertUnit: (
    mediaId: number,
    unitNumber: number,
    patch: UpsertUnitPatch,
  ) => Effect.Effect<void, DatabaseError>;
  readonly clearUnitMapping: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<void, DatabaseError>;
  readonly bulkMapUnitFiles: (
    mediaId: number,
    mappings: readonly BulkMapUnitEntry[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly upsertUnitFiles: (
    mediaId: number,
    unitNumbers: readonly number[],
    destination: string,
  ) => Effect.Effect<void, DatabaseError | UpsertUnitFileError>;
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
  readonly ensureUnits: <E>(
    mediaId: number,
    unitCount: number | undefined,
    status: string,
    startDate: string | undefined,
    endDate: string | undefined,
    futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
    nowIso: () => Effect.Effect<string, E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly updateUnitAirDates: <E>(
    mediaId: number,
    unitCount: number | undefined,
    status: string,
    startDate: string | undefined,
    endDate: string | undefined,
    futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
    nowIso: () => Effect.Effect<string, E>,
  ) => Effect.Effect<void, DatabaseError | E>;
  readonly syncUnitMetadata: (
    mediaId: number,
    episodeMetadata: ReadonlyArray<AnimeMetadataEpisode> | undefined,
  ) => Effect.Effect<void, DatabaseError>;
  readonly syncUnitSchedule: <E>(
    mediaId: number,
    nextMediaRow: {
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
  readonly patchUnitProbeMetadata: (
    unitId: number,
    patch: {
      readonly audioChannels?: string | null | undefined;
      readonly audioCodec?: string | null | undefined;
      readonly durationSeconds?: number | null | undefined;
      readonly resolution?: string | null | undefined;
      readonly videoCodec?: string | null | undefined;
    },
  ) => Effect.Effect<void, DatabaseError>;
}

export class MediaUnitRepository extends Context.Service<
  MediaUnitRepository,
  MediaUnitRepositoryShape
>()("@bakarr/api/MediaUnitRepository") {
  static readonly layer = Layer.effect(
    MediaUnitRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeMediaUnitRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeMediaUnitRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): MediaUnitRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    upsertUnit: (mediaId, unitNumber, patch) => upsertUnit(db, exec, mediaId, unitNumber, patch),
    clearUnitMapping: (mediaId, unitNumber) => clearUnitMapping(db, exec, mediaId, unitNumber),
    bulkMapUnitFiles: (mediaId, mappings) => bulkMapUnitFiles(db, exec, mediaId, mappings),
    upsertUnitFiles: (mediaId, unitNumbers, destination) =>
      upsertUnitFiles(db, exec, mediaId, unitNumbers, destination),
    updateUnitFilePaths: (mediaId, unitNumbers, filePath) =>
      updateUnitFilePaths(db, exec, mediaId, unitNumbers, filePath),
    upsertUnitMappings: (mediaId, mappings) => upsertUnitMappings(db, exec, mediaId, mappings),
    patchUnitProbeMetadata: (unitId, patch) => patchUnitProbeMetadata(db, exec, unitId, patch),
    setMediaRootAndMapUnits: (mediaId, patch, mappings) =>
      setMediaRootAndMapUnits(db, exec, mediaId, patch, mappings),
    ensureUnits: (mediaId, unitCount, status, startDate, endDate, futureAiringSchedule, nowIso) =>
      ensureUnits(
        db,
        exec,
        mediaId,
        unitCount,
        status,
        startDate,
        endDate,
        futureAiringSchedule,
        nowIso,
      ),
    updateUnitAirDates: (
      mediaId,
      unitCount,
      status,
      startDate,
      endDate,
      futureAiringSchedule,
      nowIso,
    ) =>
      updateUnitAirDates(
        db,
        exec,
        mediaId,
        unitCount,
        status,
        startDate,
        endDate,
        futureAiringSchedule,
        nowIso,
      ),
    syncUnitMetadata: (mediaId, episodeMetadata) =>
      syncUnitMetadata(db, exec, mediaId, episodeMetadata),
    syncUnitSchedule: (mediaId, nextMediaRow, futureAiringSchedule, nowIso) =>
      syncUnitSchedule(db, exec, mediaId, nextMediaRow, futureAiringSchedule, nowIso),
    backfillFromNextAiring: (input) => backfillFromNextAiring(db, exec, input),
  } satisfies MediaUnitRepositoryShape;
}

const upsertUnit = Effect.fn("MediaUnitRepository.upsertUnit")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  unitNumber: number,
  patch: UpsertUnitPatch,
) {
  const values = buildInsertEpisodeValues(mediaId, unitNumber, patch);
  const conflictSet = buildEpisodeConflictSet(patch);

  if (Object.keys(conflictSet).length === 0) {
    yield* exec.runQuery(
      "Failed to upsert episode",
      db
        .insert(mediaUnits)
        .values(values)
        .onConflictDoNothing({
          target: [mediaUnits.mediaId, mediaUnits.number],
        })
        .prepare()
        .effect(),
    );
    return;
  }

  yield* exec.runQuery(
    "Failed to upsert episode",
    db
      .insert(mediaUnits)
      .values(values)
      .onConflictDoUpdate({
        target: [mediaUnits.mediaId, mediaUnits.number],
        set: conflictSet,
      })
      .prepare()
      .effect(),
  );
});

const clearUnitMapping = Effect.fn("MediaUnitRepository.clearUnitMapping")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  unitNumber: number,
) {
  yield* exec.runQuery(
    "Failed to clear episode mapping",
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
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
      .prepare()
      .effect(),
  );
});

const patchUnitProbeMetadata = Effect.fn("MediaUnitRepository.patchUnitProbeMetadata")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  unitId: number,
  patch: {
    readonly audioChannels?: string | null | undefined;
    readonly audioCodec?: string | null | undefined;
    readonly durationSeconds?: number | null | undefined;
    readonly resolution?: string | null | undefined;
    readonly videoCodec?: string | null | undefined;
  },
) {
  yield* exec.runQuery(
    "Failed to cache probed media metadata",
    db
      .update(mediaUnits)
      .set({
        ...(patch.audioChannels === undefined ? {} : { audioChannels: patch.audioChannels }),
        ...(patch.audioCodec === undefined ? {} : { audioCodec: patch.audioCodec }),
        ...(patch.durationSeconds === undefined ? {} : { durationSeconds: patch.durationSeconds }),
        ...(patch.resolution === undefined ? {} : { resolution: patch.resolution }),
        ...(patch.videoCodec === undefined ? {} : { videoCodec: patch.videoCodec }),
      })
      .where(eq(mediaUnits.id, unitId))
      .prepare()
      .effect(),
  );
});

const bulkMapUnitFiles = Effect.fn("MediaUnitRepository.bulkMapUnitFiles")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  mappings: readonly BulkMapUnitEntry[],
) {
  yield* exec.runTransaction(
    "Failed to bulk-map episode files",
    Effect.gen(function* () {
      for (const entry of mappings) {
        if (entry.clear) {
          yield* db
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
            .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, entry.unit_number)))
            .prepare()
            .effect();
          continue;
        }

        yield* db
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
              // Remapping to a different file invalidates cached probe data.
              ...probeResetOnFilePathChange(),
            },
          })
          .prepare()
          .effect();
      }
    }),
  );
});

const upsertUnitFiles = Effect.fn("MediaUnitRepository.upsertUnitFiles")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  unitNumbers: readonly number[],
  destination: string,
) {
  if (unitNumbers.length === 0) {
    return;
  }

  yield* exec
    .runTransaction(
      "Failed to upsert episode files",
      Effect.gen(function* () {
        const episodeNumbersArr = [...unitNumbers];

        const existingRows = yield* db
          .select()
          .from(mediaUnits)
          .where(
            and(eq(mediaUnits.mediaId, mediaId), inArray(mediaUnits.number, episodeNumbersArr)),
          )
          .prepare()
          .effect();

        const existingEpisodeNumbers = new Set(existingRows.map((r) => r.number));
        const missingEpisodeNumbers = episodeNumbersArr.filter(
          (n) => !existingEpisodeNumbers.has(n),
        );

        if (existingEpisodeNumbers.size > 0) {
          yield* db
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
            )
            .prepare()
            .effect();
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

          yield* db
            .insert(mediaUnits)
            .values(valuesToInsert)
            .onConflictDoUpdate({
              target: [mediaUnits.mediaId, mediaUnits.number],
              set: {
                downloaded: true,
                filePath: destination,
              },
            })
            .prepare()
            .effect();
        }
      }),
    )
    .pipe(
      Effect.mapError(
        (cause) =>
          new UpsertUnitFileError({
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
  exec: DbExecutor,
  mediaId: number,
  unitNumbers: readonly number[],
  filePath: string,
) {
  if (unitNumbers.length === 0) {
    return;
  }

  yield* exec.runQuery(
    "Failed to update unit file paths",
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
      )
      .prepare()
      .effect(),
  );
});

const upsertUnitMappings = Effect.fn("MediaUnitRepository.upsertUnitMappings")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  mappings: readonly UnitFileMapping[],
) {
  if (mappings.length === 0) {
    return;
  }

  yield* exec.runTransaction(
    "Failed to upsert unit mappings",
    Effect.gen(function* () {
      for (const mapping of mappings) {
        yield* writeUnitMapping(db, exec, mediaId, mapping);
      }
    }),
  );
});

const setMediaRootAndMapUnits = Effect.fn("MediaUnitRepository.setMediaRootAndMapUnits")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  patch: { readonly profileName: string; readonly rootFolder: string },
  mappings: readonly UnitFileMapping[],
) {
  yield* exec.runTransaction(
    "Failed to import unmapped folder",
    Effect.gen(function* () {
      yield* db
        .update(media)
        .set({
          profileName: patch.profileName,
          rootFolder: patch.rootFolder,
        })
        .where(eq(media.id, mediaId))
        .prepare()
        .effect();

      for (const mapping of mappings) {
        yield* writeUnitMapping(db, exec, mediaId, mapping);
      }
    }),
  );
});

const writeUnitMapping = Effect.fn("MediaUnitRepository.writeUnitMapping")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  mapping: UnitFileMapping,
) {
  yield* exec.runQuery(
    "Failed to write unit mapping",
    db
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
          // Remapping to a different file invalidates cached probe data.
          ...probeResetOnFilePathChange(),
        },
      })
      .prepare()
      .effect(),
  );
});

const ensureUnits = Effect.fn("MediaUnitRepository.ensureUnits")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  unitCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  nowIso: () => Effect.Effect<string, E>,
) {
  const now = yield* nowIso();
  const hasFutureSchedule = Array.isArray(futureAiringSchedule) && futureAiringSchedule.length > 0;
  const existingRows =
    (!unitCount || unitCount <= 0) && !hasFutureSchedule
      ? []
      : yield* exec.runQuery(
          "Failed to ensure mediaUnits",
          db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)).prepare().effect(),
        );

  if (unitCount !== undefined && unitCount > 0 && existingRows.length > 0) {
    // A unitCount shrink can be a transient provider regression, so pruning is
    // conservative: never delete units that hold a file mapping (downloaded or
    // has filePath) — orphaning disk files is not recoverable from metadata.
    const extraNumbers = existingRows
      .filter((row) => row.number > unitCount && !row.downloaded && row.filePath === null)
      .map((row) => row.number);
    if (extraNumbers.length > 0) {
      yield* exec.runQuery(
        "Failed to prune extra mediaUnits",
        db
          .delete(mediaUnits)
          .where(and(eq(mediaUnits.mediaId, mediaId), inArray(mediaUnits.number, extraNumbers)))
          .prepare()
          .effect(),
      );
    }
  }

  const missingRows = buildMissingEpisodeRows({
    mediaId,
    unitCount,
    endDate,
    existingRows,
    futureAiringSchedule,
    nowIso: now,
    startDate,
    status,
  });

  if (missingRows.length === 0) {
    return;
  }

  yield* exec.runQuery(
    "Failed to ensure mediaUnits",
    db
      .insert(mediaUnits)
      .values(missingRows)
      .onConflictDoNothing({ target: [mediaUnits.mediaId, mediaUnits.number] })
      .prepare()
      .effect(),
  );
});

const updateUnitAirDates = Effect.fn("MediaUnitRepository.updateUnitAirDates")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
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

  const existingRows = yield* exec.runQuery(
    "Failed to update media episode air dates",
    db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)).prepare().effect(),
  );
  const now = yield* nowIso();

  const updates: { readonly id: number; readonly aired: string | null }[] = [];

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

    updates.push({ id: row.id, aired: inferred });
  }

  if (updates.length === 0) {
    return;
  }

  yield* exec.runTransaction(
    "Failed to update media episode air dates",
    Effect.gen(function* () {
      for (const update of updates) {
        yield* db
          .update(mediaUnits)
          .set({ aired: update.aired })
          .where(eq(mediaUnits.id, update.id))
          .prepare()
          .effect();
      }
    }),
  );
});

const syncUnitMetadata = Effect.fn("MediaUnitRepository.syncUnitMetadata")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  episodeMetadata: ReadonlyArray<AnimeMetadataEpisode> | undefined,
) {
  if (!Array.isArray(episodeMetadata) || episodeMetadata.length === 0) {
    return;
  }

  yield* exec.runTransaction(
    "Failed to sync episode metadata",
    Effect.gen(function* () {
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
          yield* db.insert(mediaUnits).values(insertBase).onConflictDoNothing().prepare().effect();
          continue;
        }

        yield* db
          .insert(mediaUnits)
          .values(insertBase)
          .onConflictDoUpdate({
            target: [mediaUnits.mediaId, mediaUnits.number],
            set: updateSet,
          })
          .prepare()
          .effect();
      }
    }),
  );
});

const syncUnitSchedule = Effect.fn("MediaUnitRepository.syncUnitSchedule")(function* <E>(
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  nextMediaRow: {
    readonly unitCount: number | null;
    readonly status: string;
    readonly startDate: string | null;
    readonly endDate: string | null;
  },
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  nowIso: () => Effect.Effect<string, E>,
) {
  yield* ensureUnits(
    db,
    exec,
    mediaId,
    nextMediaRow.unitCount ?? undefined,
    nextMediaRow.status,
    nextMediaRow.startDate ?? undefined,
    nextMediaRow.endDate ?? undefined,
    futureAiringSchedule,
    nowIso,
  );
  yield* updateUnitAirDates(
    db,
    exec,
    mediaId,
    nextMediaRow.unitCount ?? undefined,
    nextMediaRow.status,
    nextMediaRow.startDate ?? undefined,
    nextMediaRow.endDate ?? undefined,
    futureAiringSchedule,
    nowIso,
  );
});

const backfillFromNextAiring = Effect.fn("MediaUnitRepository.backfillFromNextAiring")(function* (
  db: AppDatabase,
  exec: DbExecutor,
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

  const candidates = yield* exec.runQuery(
    "Failed to load next-airing backfill candidates",
    db
      .select({
        id: media.id,
        nextAiringAt: media.nextAiringAt,
        nextAiringUnit: media.nextAiringUnit,
      })
      .from(media)
      .where(whereClause)
      .prepare()
      .effect(),
  );

  if (candidates.length === 0) {
    return;
  }

  const candidateIds = candidates.map((candidate) => candidate.id);
  const existingRows = yield* exec.runQuery(
    "Failed to load existing mediaUnits for backfill",
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
      )
      .prepare()
      .effect(),
  );

  const existingByMediaId = new Map<number, Set<number>>();

  for (const row of existingRows) {
    const numbers = existingByMediaId.get(row.mediaId);

    if (numbers) {
      numbers.add(row.number);
      continue;
    }

    existingByMediaId.set(row.mediaId, new Set([row.number]));
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

    const existingNumbers = existingByMediaId.get(candidate.id) ?? new Set<number>();
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

  yield* exec.runQuery(
    "Failed to backfill mediaUnits from next airing",
    db.insert(mediaUnits).values(rowsToInsert).onConflictDoNothing().prepare().effect(),
  );
});

function buildInsertEpisodeValues(mediaId: number, unitNumber: number, patch: UpsertUnitPatch) {
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

type UnitProbeColumnName =
  | "audioChannels"
  | "audioCodec"
  | "durationSeconds"
  | "fileSize"
  | "groupName"
  | "quality"
  | "resolution"
  | "videoCodec";

const UNIT_PROBE_COLUMN_NAMES: ReadonlyArray<UnitProbeColumnName> = [
  "audioChannels",
  "audioCodec",
  "durationSeconds",
  "fileSize",
  "groupName",
  "quality",
  "resolution",
  "videoCodec",
];

/**
 * Conflict-set fragment that keeps each cached probe column only when the
 * conflicting insert targets the same `file_path`; a remap to a different
 * file nulls the stale probe data. Explicit patch values spread after this
 * fragment and win.
 */
function probeResetOnFilePathChange(): Partial<Record<UnitProbeColumnName, SQL>> {
  const reset: Partial<Record<UnitProbeColumnName, SQL>> = {};

  for (const name of UNIT_PROBE_COLUMN_NAMES) {
    reset[name] = sql`case when excluded.${sql.identifier("file_path")} is ${
      mediaUnits.filePath
    } then ${mediaUnits[name]} else null end`;
  }

  return reset;
}

function buildEpisodeConflictSet(patch: UpsertUnitPatch) {
  const patchSet = {
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

  if (patch.filePath === undefined) {
    return patchSet;
  }

  return {
    ...probeResetOnFilePathChange(),
    ...patchSet,
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
