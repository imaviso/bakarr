// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers
import { and, asc, count, eq, inArray, ne, or, sql } from "drizzle-orm";

import { brandMediaId, type CalendarEvent, type MissingUnit } from "@packages/shared/index.ts";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { media, mediaUnits, systemLogs } from "@/db/schema.ts";
import { deriveEpisodeTimelineMetadata } from "@/features/media/shared/derivations.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { Context, Effect, Layer, Option } from "effect";

export interface MediaUnitProgressStat {
  readonly mediaId: number;
  readonly downloadedCount: number;
  readonly latestDownloadedUnit: number | null;
}

export interface MediaRepositoryShape {
  readonly getMediaRow: (
    mediaId: number,
  ) => Effect.Effect<typeof media.$inferSelect, DatabaseError | MediaNotFoundError>;
  readonly requireMediaExists: (
    mediaId: number,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError>;
  readonly mediaExists: (mediaId: number) => Effect.Effect<boolean, DatabaseError>;
  readonly findExistingMediaIds: (
    mediaIds: readonly number[],
  ) => Effect.Effect<ReadonlySet<number>, DatabaseError>;
  readonly getUnitRow: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<typeof mediaUnits.$inferSelect, DatabaseError | MediaNotFoundError>;
  readonly loadCurrentUnitState: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<
    Option.Option<{ readonly downloaded: boolean; readonly filePath?: string }>,
    DatabaseError
  >;
  readonly findMediaRootFolderOwner: (
    rootFolder: string,
  ) => Effect.Effect<
    { readonly id: number; readonly rootFolder: string; readonly titleRomaji: string } | null,
    DatabaseError
  >;
  readonly findMediaByExactRootFolder: (
    rootFolder: string,
  ) => Effect.Effect<
    { readonly id: number; readonly titleRomaji: string } | undefined,
    DatabaseError
  >;
  readonly countMedia: (input: {
    readonly monitored?: boolean;
  }) => Effect.Effect<number, DatabaseError>;
  readonly listMediaRows: (input: {
    readonly monitored?: boolean;
    readonly limit: number;
    readonly offset: number;
  }) => Effect.Effect<readonly (typeof media.$inferSelect)[], DatabaseError>;
  readonly listAllMediaRows: () => Effect.Effect<
    readonly (typeof media.$inferSelect)[],
    DatabaseError
  >;
  readonly listUnitRowsByMediaId: (
    mediaId: number,
  ) => Effect.Effect<readonly (typeof mediaUnits.$inferSelect)[], DatabaseError>;
  readonly listUnitRowsWithMediaKind: (mediaId: number) => Effect.Effect<
    readonly {
      readonly unit: typeof mediaUnits.$inferSelect;
      readonly mediaKind: string;
    }[],
    DatabaseError
  >;
  readonly listUnitProgressStats: (
    mediaIds: readonly number[],
  ) => Effect.Effect<readonly MediaUnitProgressStat[], DatabaseError>;
  readonly listMissingUnitNumbers: (
    mediaIds: readonly number[],
  ) => Effect.Effect<
    readonly { readonly mediaId: number; readonly number: number }[],
    DatabaseError
  >;
  readonly loadUnitsByNumbers: (
    mediaId: number,
    numbers: readonly number[],
  ) => Effect.Effect<readonly (typeof mediaUnits.$inferSelect)[], DatabaseError>;
  readonly listCalendarEvents: (
    start: string,
    end: string,
    now: Date,
  ) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly listMappedUnitRows: (
    mediaId: number,
  ) => Effect.Effect<readonly (typeof mediaUnits.$inferSelect)[], DatabaseError>;
  readonly listImportScanMappedUnits: (input: {
    readonly mediaIds: readonly number[];
    readonly paths: readonly string[];
    readonly unitNumbers: readonly number[];
  }) => Effect.Effect<
    readonly {
      readonly media_id: number;
      readonly media_title: string;
      readonly unit_number: number;
      readonly file_path: string | null;
    }[],
    DatabaseError
  >;
  readonly listScopedUnitRows: (input: {
    readonly mediaIds: readonly number[];
    readonly unitNumbers: readonly number[];
  }) => Effect.Effect<
    readonly {
      readonly aired: string | null;
      readonly mediaId: number;
      readonly number: number;
      readonly title: string | null;
    }[],
    DatabaseError
  >;
  readonly listWantedMissing: (
    limit: number,
    nowIso: string,
  ) => Effect.Effect<MissingUnit[], DatabaseError>;
  readonly listMissingUnitSearchRows: (input: {
    readonly mediaId?: number;
    readonly nowIso: string;
    readonly limit: number;
  }) => Effect.Effect<
    readonly {
      readonly media: typeof media.$inferSelect;
      readonly media_units: typeof mediaUnits.$inferSelect;
    }[],
    DatabaseError
  >;
  readonly updateMonitored: (
    mediaId: number,
    monitored: boolean,
  ) => Effect.Effect<void, DatabaseError>;
  readonly updateRootFolder: (
    mediaId: number,
    rootFolder: string,
  ) => Effect.Effect<void, DatabaseError>;
  readonly updateProfileName: (
    mediaId: number,
    profileName: string,
  ) => Effect.Effect<void, DatabaseError>;
  readonly updateReleaseProfileIds: (
    mediaId: number,
    releaseProfileIds: string,
  ) => Effect.Effect<void, DatabaseError>;
  readonly insertMediaAggregate: (input: {
    readonly mediaRow: typeof media.$inferInsert;
    readonly unitRows: readonly (typeof mediaUnits.$inferInsert)[];
    readonly log: typeof systemLogs.$inferInsert;
  }) => Effect.Effect<void, DatabaseError>;
  readonly updateMediaRow: (
    mediaId: number,
    row: typeof media.$inferInsert | Partial<typeof media.$inferInsert>,
  ) => Effect.Effect<void, DatabaseError>;
  readonly deleteMedia: (mediaId: number) => Effect.Effect<void, DatabaseError>;
  readonly listMonitoredMediaIds: () => Effect.Effect<readonly number[], DatabaseError>;
}

export class MediaRepository extends Context.Service<MediaRepository, MediaRepositoryShape>()(
  "@bakarr/api/MediaRepository",
) {
  static readonly layer = Layer.effect(
    MediaRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeMediaRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeMediaRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): MediaRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    countMedia: (input) => countMediaEffect(db, exec, input),
    findExistingMediaIds: (mediaIds) => findExistingMediaIdsEffect(db, exec, mediaIds),
    findMediaRootFolderOwner: (rootFolder) => findMediaRootFolderOwnerEffect(db, exec, rootFolder),
    findMediaByExactRootFolder: (rootFolder) =>
      findMediaByExactRootFolderEffect(db, exec, rootFolder),
    listAllMediaRows: () => listAllMediaRowsEffect(db, exec),
    getMediaRow: (mediaId) => getMediaRowEffect(db, exec, mediaId),
    getUnitRow: (mediaId, unitNumber) => getUnitRowEffect(db, exec, mediaId, unitNumber),
    listCalendarEvents: (start, end, now) => listCalendarEventsEffect(db, exec, start, end, now),
    listMappedUnitRows: (mediaId) => listMappedUnitRowsEffect(db, exec, mediaId),
    listImportScanMappedUnits: (input) => listImportScanMappedUnitsEffect(db, exec, input),
    listScopedUnitRows: (input) => listScopedUnitRowsEffect(db, exec, input),
    listMediaRows: (input) => listMediaRowsEffect(db, exec, input),
    listMissingUnitNumbers: (mediaIds) => listMissingUnitNumbersEffect(db, exec, mediaIds),
    listUnitProgressStats: (mediaIds) => listUnitProgressStatsEffect(db, exec, mediaIds),
    listUnitRowsByMediaId: (mediaId) => listUnitRowsByMediaIdEffect(db, exec, mediaId),
    listUnitRowsWithMediaKind: (mediaId) => listUnitRowsWithMediaKindEffect(db, exec, mediaId),
    listWantedMissing: (limit, nowIso) => listWantedMissingEffect(db, exec, limit, nowIso),
    listMissingUnitSearchRows: (input) => listMissingUnitSearchRowsEffect(db, exec, input),
    loadCurrentUnitState: (mediaId, unitNumber) =>
      loadCurrentUnitStateEffect(db, exec, mediaId, unitNumber),
    loadUnitsByNumbers: (mediaId, numbers) => loadUnitsByNumbersEffect(db, exec, mediaId, numbers),
    mediaExists: (mediaId) => mediaExistsEffect(db, exec, mediaId),
    requireMediaExists: (mediaId) => requireMediaExistsEffect(db, exec, mediaId),
    deleteMedia: (mediaId) => deleteMediaEffect(db, exec, mediaId),
    insertMediaAggregate: (input) => insertMediaAggregateEffect(db, exec, input),
    listMonitoredMediaIds: () => listMonitoredMediaIdsEffect(db, exec),
    updateMediaRow: (mediaId, row) => updateMediaRowEffect(db, exec, mediaId, row),
    updateMonitored: (mediaId, monitored) => updateMonitoredEffect(db, exec, mediaId, monitored),
    updateProfileName: (mediaId, profileName) =>
      updateProfileNameEffect(db, exec, mediaId, profileName),
    updateReleaseProfileIds: (mediaId, releaseProfileIds) =>
      updateReleaseProfileIdsEffect(db, exec, mediaId, releaseProfileIds),
    updateRootFolder: (mediaId, rootFolder) =>
      updateRootFolderEffect(db, exec, mediaId, rootFolder),
  } satisfies MediaRepositoryShape;
}

const getMediaRowEffect = Effect.fn("MediaRepository.getMediaRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  const row = yield* exec.queryFirst(
    "Failed to load media",
    db.select().from(media).where(eq(media.id, mediaId)).limit(1).prepare().effect(),
  );
  if (Option.isNone(row)) {
    return yield* new MediaNotFoundError({ message: "Media not found" });
  }
  return row.value;
});

const requireMediaExistsEffect = Effect.fn("MediaRepository.requireMediaExists")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  yield* getMediaRowEffect(db, exec, mediaId);
});

const getUnitRowEffect = Effect.fn("MediaRepository.getUnitRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  unitNumber: number,
) {
  const row = yield* exec.queryFirst(
    "Failed to load episode",
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
      .limit(1)
      .prepare()
      .effect(),
  );
  if (Option.isNone(row)) {
    return yield* new MediaNotFoundError({ message: "MediaUnit not found" });
  }
  return row.value;
});

const loadCurrentUnitStateEffect = Effect.fn("MediaRepository.loadCurrentUnitState")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  unitNumber: number,
) {
  const row = yield* exec.queryFirst(
    "Failed to load episode state",
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
      .limit(1)
      .prepare()
      .effect(),
  );

  return Option.isSome(row)
    ? Option.some({
        downloaded: row.value.downloaded,
        ...(row.value.filePath == null ? {} : { filePath: row.value.filePath }),
      })
    : Option.none();
});

const findMediaByExactRootFolderEffect = Effect.fn("MediaRepository.findMediaByExactRootFolder")(
  function* (db: AppDatabase, exec: DbExecutor, rootFolder: string) {
    const rows = yield* exec.runQuery(
      "Failed to find media by root folder",
      db
        .select({ id: media.id, titleRomaji: media.titleRomaji })
        .from(media)
        .where(eq(media.rootFolder, rootFolder))
        .limit(1)
        .prepare()
        .effect(),
    );
    return rows[0];
  },
);

const findMediaRootFolderOwnerEffect = Effect.fn("MediaRepository.findMediaRootFolderOwner")(
  function* (db: AppDatabase, exec: DbExecutor, rootFolder: string) {
    const normalized = normalizeRootFolder(rootFolder);
    const parentCandidates = buildParentPaths(normalized);
    const parentCandidatesWithSlash = parentCandidates.flatMap((candidate) =>
      candidate === "/" ? [candidate] : [candidate, `${candidate}/`],
    );
    const escapedNormalized = normalized
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const rows = yield* exec.runQuery(
      "Failed to find media root folder owner",
      db
        .select({
          id: media.id,
          rootFolder: media.rootFolder,
          titleRomaji: media.titleRomaji,
        })
        .from(media)
        .where(
          or(
            inArray(media.rootFolder, [...parentCandidatesWithSlash]),
            sql`${media.rootFolder} LIKE ${`${escapedNormalized}/%`} ESCAPE '\\'`,
          ),
        )
        .prepare()
        .effect(),
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

const listWantedMissingEffect = Effect.fn("MediaRepository.listWantedMissing")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  limit: number,
  nowIso: string,
) {
  const now = new Date(nowIso).toISOString();
  const rows = yield* exec.runQuery(
    "Failed to load wanted mediaUnits",
    db
      .select()
      .from(mediaUnits)
      .innerJoin(media, eq(media.id, mediaUnits.mediaId))
      .where(
        and(
          eq(media.monitored, true),
          eq(mediaUnits.downloaded, false),
          or(
            and(
              eq(media.mediaKind, "anime"),
              sql`${mediaUnits.aired} is not null`,
              sql`${mediaUnits.aired} <= ${now}`,
            ),
            ne(media.mediaKind, "anime"),
          ),
        ),
      )
      .orderBy(sql`${mediaUnits.aired} is null`, asc(mediaUnits.aired), media.titleRomaji)
      .limit(Math.max(1, limit))
      .prepare()
      .effect(),
  );

  return rows.map(({ media: mediaRow, media_units: unitRow }) => {
    const timeline = deriveEpisodeTimelineMetadata(unitRow.aired ?? undefined, new Date(now));

    return {
      aired: unitRow.aired ?? undefined,
      airing_status: timeline.airing_status,
      media_id: brandMediaId(mediaRow.id),
      media_image: mediaRow.coverImage ?? undefined,
      media_title: mediaRow.titleRomaji,
      unit_kind: mediaRow.mediaKind === "anime" ? "episode" : "volume",
      unit_number: unitRow.number,
      unit_title: unitRow.title ?? undefined,
      is_future: timeline.is_future,
      next_airing_unit:
        mediaRow.nextAiringAt && mediaRow.nextAiringUnit
          ? {
              airing_at: mediaRow.nextAiringAt,
              unit_number: mediaRow.nextAiringUnit,
            }
          : undefined,
    } satisfies MissingUnit;
  });
});

const listMissingUnitSearchRowsEffect = Effect.fn("MediaRepository.listMissingUnitSearchRows")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly mediaId?: number;
      readonly nowIso: string;
      readonly limit: number;
    },
  ) {
    const missingConditions = [
      eq(mediaUnits.downloaded, false),
      or(
        and(
          eq(media.mediaKind, "anime"),
          sql`${mediaUnits.aired} is not null`,
          sql`${mediaUnits.aired} <= ${input.nowIso}`,
        ),
        and(
          ne(media.mediaKind, "anime"),
          or(sql`${mediaUnits.aired} is null`, sql`${mediaUnits.aired} <= ${input.nowIso}`),
        ),
      ),
      input.mediaId === undefined
        ? eq(media.monitored, true)
        : eq(mediaUnits.mediaId, input.mediaId),
    ];

    return yield* exec.runQuery(
      "Failed to queue missing-unit search",
      db
        .select()
        .from(mediaUnits)
        .innerJoin(media, eq(media.id, mediaUnits.mediaId))
        .where(and(...missingConditions))
        .orderBy(media.titleRomaji, mediaUnits.number)
        .limit(Math.max(1, input.limit))
        .prepare()
        .effect(),
    );
  },
);

const listCalendarEventsEffect = Effect.fn("MediaRepository.listCalendarEvents")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  start: string,
  end: string,
  now: Date,
) {
  const nowIsoValue = now.toISOString();
  const rows = yield* exec.runQuery(
    "Failed to load calendar events",
    db
      .select()
      .from(mediaUnits)
      .innerJoin(media, eq(media.id, mediaUnits.mediaId))
      .where(and(sql`${mediaUnits.aired} >= ${start}`, sql`${mediaUnits.aired} <= ${end}`))
      .orderBy(mediaUnits.aired, media.titleRomaji)
      .prepare()
      .effect(),
  );

  return rows.map(({ media: mediaRow, media_units: unitRow }) => {
    const timeline = deriveEpisodeTimelineMetadata(unitRow.aired ?? undefined, now);

    return {
      all_day: isAllDayAiring(unitRow.aired),
      end: unitRow.aired ?? nowIsoValue,
      extended_props: {
        airing_status: timeline.airing_status,
        media_id: brandMediaId(mediaRow.id),
        media_image: mediaRow.coverImage ?? undefined,
        media_title: mediaRow.titleRomaji,
        downloaded: unitRow.downloaded,
        unit_kind: mediaRow.mediaKind === "anime" ? "episode" : "volume",
        unit_number: unitRow.number,
        unit_title: unitRow.title ?? undefined,
        is_future: timeline.is_future,
      },
      id: `${mediaRow.id}-${unitRow.number}`,
      start: unitRow.aired ?? nowIsoValue,
      title: buildCalendarEventTitle(mediaRow.titleRomaji, unitRow, mediaRow.mediaKind),
    } satisfies CalendarEvent;
  });
});

const listMappedUnitRowsEffect = Effect.fn("MediaRepository.listMappedUnitRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  return yield* exec.runQuery(
    "Failed to load mediaUnits for rename preview",
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), sql`${mediaUnits.filePath} is not null`))
      .prepare()
      .effect(),
  );
});

const listImportScanMappedUnitsEffect = Effect.fn("MediaRepository.listImportScanMappedUnits")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly mediaIds: readonly number[];
      readonly paths: readonly string[];
      readonly unitNumbers: readonly number[];
    },
  ) {
    if (
      input.paths.length === 0 &&
      (input.mediaIds.length === 0 || input.unitNumbers.length === 0)
    ) {
      return [];
    }

    const byPath =
      input.paths.length > 0 ? inArray(mediaUnits.filePath, [...input.paths]) : undefined;
    const byMediaUnit =
      input.mediaIds.length > 0 && input.unitNumbers.length > 0
        ? and(
            inArray(mediaUnits.mediaId, [...input.mediaIds]),
            inArray(mediaUnits.number, [...input.unitNumbers]),
          )
        : undefined;
    const whereClause = byPath && byMediaUnit ? or(byPath, byMediaUnit) : (byPath ?? byMediaUnit);

    if (!whereClause) {
      return [];
    }

    return yield* exec
      .runQuery(
        "Failed to scan import path",
        db
          .select()
          .from(mediaUnits)
          .innerJoin(media, eq(mediaUnits.mediaId, media.id))
          .where(whereClause)
          .prepare()
          .effect(),
      )
      .pipe(
        Effect.map((rows) =>
          rows.map(({ media: mediaRow, media_units: unitRow }) => ({
            file_path: unitRow.filePath,
            media_id: unitRow.mediaId,
            media_title: mediaRow.titleRomaji,
            unit_number: unitRow.number,
          })),
        ),
      );
  },
);

const listScopedUnitRowsEffect = Effect.fn("MediaRepository.listScopedUnitRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly mediaIds: readonly number[];
    readonly unitNumbers: readonly number[];
  },
) {
  if (input.mediaIds.length === 0 || input.unitNumbers.length === 0) {
    return [];
  }

  return yield* exec.runQuery(
    "Failed to scan import path",
    db
      .select({
        aired: mediaUnits.aired,
        mediaId: mediaUnits.mediaId,
        number: mediaUnits.number,
        title: mediaUnits.title,
      })
      .from(mediaUnits)
      .where(
        and(
          inArray(mediaUnits.mediaId, [...input.mediaIds]),
          inArray(mediaUnits.number, [...input.unitNumbers]),
        ),
      )
      .prepare()
      .effect(),
  );
});

const mediaExistsEffect = Effect.fn("MediaRepository.mediaExists")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to check library status",
    db
      .select({ id: media.id })
      .from(media)
      .where(eq(media.id, mediaId))
      .limit(1)
      .prepare()
      .effect(),
  );
  return rows.length > 0;
});

const findExistingMediaIdsEffect = Effect.fn("MediaRepository.findExistingMediaIds")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaIds: readonly number[],
) {
  if (mediaIds.length === 0) {
    return new Set<number>();
  }
  const rows = yield* exec.runQuery(
    "Failed to mark search results in library",
    db
      .select({ id: media.id })
      .from(media)
      .where(inArray(media.id, [...mediaIds]))
      .prepare()
      .effect(),
  );
  return new Set(rows.map((row) => row.id));
});

const listAllMediaRowsEffect = Effect.fn("MediaRepository.listAllMediaRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  return yield* exec.runQuery(
    "Failed to list all media",
    db.select().from(media).orderBy(media.id).prepare().effect(),
  );
});

const listMediaRowsEffect = Effect.fn("MediaRepository.listMediaRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: { readonly monitored?: boolean; readonly limit: number; readonly offset: number },
) {
  const monitoredCondition =
    input.monitored !== undefined ? eq(media.monitored, input.monitored) : undefined;
  const baseQuery = db.select().from(media);
  const query = monitoredCondition ? baseQuery.where(monitoredCondition) : baseQuery;
  return yield* exec.runQuery(
    "Failed to list media",
    query.orderBy(media.id).limit(input.limit).offset(input.offset).prepare().effect(),
  );
});

const countMediaEffect = Effect.fn("MediaRepository.countMedia")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: { readonly monitored?: boolean },
) {
  const monitoredCondition =
    input.monitored !== undefined ? eq(media.monitored, input.monitored) : undefined;
  const rows = yield* (function () {
    const countQuery = db.select({ count: count() }).from(media);
    const __q = monitoredCondition ? countQuery.where(monitoredCondition) : countQuery;
    return exec.runQuery("Failed to count media", __q.prepare().effect());
  })();
  return rows[0]?.count ?? 0;
});

const listUnitRowsByMediaIdEffect = Effect.fn("MediaRepository.listUnitRowsByMediaId")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  return yield* exec.runQuery(
    "Failed to load media",
    db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)).prepare().effect(),
  );
});

const listUnitRowsWithMediaKindEffect = Effect.fn("MediaRepository.listUnitRowsWithMediaKind")(
  function* (db: AppDatabase, exec: DbExecutor, mediaId: number) {
    return yield* exec
      .runQuery(
        "Failed to list mediaUnits",
        db
          .select()
          .from(mediaUnits)
          .innerJoin(media, eq(media.id, mediaUnits.mediaId))
          .where(eq(mediaUnits.mediaId, mediaId))
          .prepare()
          .effect(),
      )
      .pipe(
        Effect.map((rows) =>
          rows.map(({ media: mediaRow, media_units: unitRow }) => ({
            mediaKind: mediaRow.mediaKind,
            unit: unitRow,
          })),
        ),
      );
  },
);

const listUnitProgressStatsEffect = Effect.fn("MediaRepository.listUnitProgressStats")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaIds: readonly number[],
) {
  if (mediaIds.length === 0) {
    return [];
  }
  return yield* exec.runQuery(
    "Failed to list media",
    db
      .select({
        mediaId: mediaUnits.mediaId,
        downloadedCount: sql<number>`coalesce(sum(case when ${mediaUnits.downloaded} then 1 else 0 end), 0)`,
        latestDownloadedUnit: sql<
          number | null
        >`max(case when ${mediaUnits.downloaded} then ${mediaUnits.number} else null end)`,
      })
      .from(mediaUnits)
      .where(inArray(mediaUnits.mediaId, [...mediaIds]))
      .groupBy(mediaUnits.mediaId)
      .prepare()
      .effect(),
  );
});

const listMissingUnitNumbersEffect = Effect.fn("MediaRepository.listMissingUnitNumbers")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaIds: readonly number[],
) {
  if (mediaIds.length === 0) {
    return [];
  }
  return yield* exec.runQuery(
    "Failed to list media",
    db
      .select({
        mediaId: mediaUnits.mediaId,
        number: mediaUnits.number,
      })
      .from(mediaUnits)
      .where(and(inArray(mediaUnits.mediaId, [...mediaIds]), eq(mediaUnits.downloaded, false)))
      .prepare()
      .effect(),
  );
});

const loadUnitsByNumbersEffect = Effect.fn("MediaRepository.loadUnitsByNumbers")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  numbers: readonly number[],
) {
  if (numbers.length === 0) {
    return [];
  }

  return yield* exec.runQuery(
    "Failed to load media units",
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), inArray(mediaUnits.number, [...numbers])))
      .prepare()
      .effect(),
  );
});

const updateMonitoredEffect = Effect.fn("MediaRepository.updateMonitored")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  monitored: boolean,
) {
  yield* exec.runQuery(
    "Failed to update media",
    db.update(media).set({ monitored }).where(eq(media.id, mediaId)).prepare().effect(),
  );
});

const updateRootFolderEffect = Effect.fn("MediaRepository.updateRootFolder")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  rootFolder: string,
) {
  yield* exec.runQuery(
    "Failed to update media path",
    db.update(media).set({ rootFolder }).where(eq(media.id, mediaId)).prepare().effect(),
  );
});

const updateProfileNameEffect = Effect.fn("MediaRepository.updateProfileName")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  profileName: string,
) {
  yield* exec.runQuery(
    "Failed to update media",
    db.update(media).set({ profileName }).where(eq(media.id, mediaId)).prepare().effect(),
  );
});

const updateReleaseProfileIdsEffect = Effect.fn("MediaRepository.updateReleaseProfileIds")(
  function* (db: AppDatabase, exec: DbExecutor, mediaId: number, releaseProfileIds: string) {
    yield* exec.runQuery(
      "Failed to update media",
      db.update(media).set({ releaseProfileIds }).where(eq(media.id, mediaId)).prepare().effect(),
    );
  },
);

const insertMediaAggregateEffect = Effect.fn("MediaRepository.insertMediaAggregate")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly mediaRow: typeof media.$inferInsert;
    readonly unitRows: readonly (typeof mediaUnits.$inferInsert)[];
    readonly log: typeof systemLogs.$inferInsert;
  },
) {
  yield* exec.runTransaction(
    "Failed to insert media aggregate",
    Effect.gen(function* () {
      yield* db.insert(media).values(input.mediaRow).prepare().effect();

      if (input.unitRows.length > 0) {
        yield* db
          .insert(mediaUnits)
          .values([...input.unitRows])
          .prepare()
          .effect();
      }

      yield* db.insert(systemLogs).values(input.log).prepare().effect();
    }),
  );
});

const updateMediaRowEffect = Effect.fn("MediaRepository.updateMediaRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  row: typeof media.$inferInsert | Partial<typeof media.$inferInsert>,
) {
  yield* exec.runQuery(
    "Failed to update media",
    db.update(media).set(row).where(eq(media.id, mediaId)).prepare().effect(),
  );
});

const deleteMediaEffect = Effect.fn("MediaRepository.deleteMedia")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  yield* exec.runQuery(
    "Failed to delete media",
    db.delete(media).where(eq(media.id, mediaId)).prepare().effect(),
  );
});

const listMonitoredMediaIdsEffect = Effect.fn("MediaRepository.listMonitoredMediaIds")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  const rows = yield* exec.runQuery(
    "Failed to list monitored media ids",
    db.select({ id: media.id }).from(media).where(eq(media.monitored, true)).prepare().effect(),
  );
  return rows.map((row) => row.id);
});

function isAllDayAiring(aired?: string | null) {
  return !aired?.includes("T");
}

function buildCalendarEventTitle(
  mediaTitle: string,
  unitRow: { number: number; title: string | null },
  mediaKind: string,
) {
  const unitLabel = mediaKind === "anime" ? "Episode" : "Volume";

  return unitRow.title
    ? `${mediaTitle} - ${unitLabel} ${unitRow.number}: ${unitRow.title}`
    : `${mediaTitle} - ${unitLabel} ${unitRow.number}`;
}

function normalizeRootFolder(rootFolder: string) {
  if (rootFolder === "/") {
    return "/";
  }

  return rootFolder.replace(/\/+$/, "");
}

function buildParentPaths(normalized: string): ReadonlyArray<string> {
  if (normalized === "/") {
    return ["/"];
  }
  const parts = normalized.split("/").filter((segment) => segment.length > 0);
  const paths: Array<string> = ["/"];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    paths.push(current);
  }
  return paths;
}
