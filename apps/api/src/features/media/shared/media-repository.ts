import { and, asc, count, eq, inArray, ne, or, sql } from "drizzle-orm";
import { Effect, Option } from "effect";

import { brandMediaId, type CalendarEvent, type MissingUnit } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { media, mediaUnits, systemLogs } from "@/db/schema.ts";
import { deriveEpisodeTimelineMetadata } from "@/domain/media/derivations.ts";
import { queryFirst, tryDatabasePromise } from "@/infra/effect/db.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";

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
      readonly episode: typeof mediaUnits.$inferSelect;
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

export class MediaRepository extends Effect.Service<MediaRepository>()(
  "@bakarr/api/MediaRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeMediaRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

function makeMediaRepositoryShape(db: AppDatabase): MediaRepositoryShape {
  return {
    countMedia: (input) => countMediaEffect(db, input),
    findExistingMediaIds: (mediaIds) => findExistingMediaIdsEffect(db, mediaIds),
    findMediaRootFolderOwner: (rootFolder) => findMediaRootFolderOwnerEffect(db, rootFolder),
    findMediaByExactRootFolder: (rootFolder) => findMediaByExactRootFolderEffect(db, rootFolder),
    listAllMediaRows: () => listAllMediaRowsEffect(db),
    getMediaRow: (mediaId) => getMediaRowEffect(db, mediaId),
    getUnitRow: (mediaId, unitNumber) => getUnitRowEffect(db, mediaId, unitNumber),
    listCalendarEvents: (start, end, now) => listCalendarEventsEffect(db, start, end, now),
    listMappedUnitRows: (mediaId) => listMappedUnitRowsEffect(db, mediaId),
    listImportScanMappedUnits: (input) => listImportScanMappedUnitsEffect(db, input),
    listScopedUnitRows: (input) => listScopedUnitRowsEffect(db, input),
    listMediaRows: (input) => listMediaRowsEffect(db, input),
    listMissingUnitNumbers: (mediaIds) => listMissingUnitNumbersEffect(db, mediaIds),
    listUnitProgressStats: (mediaIds) => listUnitProgressStatsEffect(db, mediaIds),
    listUnitRowsByMediaId: (mediaId) => listUnitRowsByMediaIdEffect(db, mediaId),
    listUnitRowsWithMediaKind: (mediaId) => listUnitRowsWithMediaKindEffect(db, mediaId),
    listWantedMissing: (limit, nowIso) => listWantedMissingEffect(db, limit, nowIso),
    listMissingUnitSearchRows: (input) => listMissingUnitSearchRowsEffect(db, input),
    loadCurrentUnitState: (mediaId, unitNumber) =>
      loadCurrentUnitStateEffect(db, mediaId, unitNumber),
    loadUnitsByNumbers: (mediaId, numbers) => loadUnitsByNumbersEffect(db, mediaId, numbers),
    mediaExists: (mediaId) => mediaExistsEffect(db, mediaId),
    requireMediaExists: (mediaId) => requireMediaExistsEffect(db, mediaId),
    deleteMedia: (mediaId) => deleteMediaEffect(db, mediaId),
    insertMediaAggregate: (input) => insertMediaAggregateEffect(db, input),
    listMonitoredMediaIds: () => listMonitoredMediaIdsEffect(db),
    updateMediaRow: (mediaId, row) => updateMediaRowEffect(db, mediaId, row),
    updateMonitored: (mediaId, monitored) => updateMonitoredEffect(db, mediaId, monitored),
    updateProfileName: (mediaId, profileName) => updateProfileNameEffect(db, mediaId, profileName),
    updateReleaseProfileIds: (mediaId, releaseProfileIds) =>
      updateReleaseProfileIdsEffect(db, mediaId, releaseProfileIds),
    updateRootFolder: (mediaId, rootFolder) => updateRootFolderEffect(db, mediaId, rootFolder),
  } satisfies MediaRepositoryShape;
}

export function makeMediaRepository(db: AppDatabase): MediaRepository {
  return MediaRepository.make(makeMediaRepositoryShape(db));
}

const getMediaRowEffect = Effect.fn("MediaRepository.getMediaRow")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const row = yield* queryFirst("Failed to load media", () =>
    db.select().from(media).where(eq(media.id, mediaId)).limit(1),
  );
  if (Option.isNone(row)) {
    return yield* new MediaNotFoundError({ message: "Media not found" });
  }
  return row.value;
});

const requireMediaExistsEffect = Effect.fn("MediaRepository.requireMediaExists")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  yield* getMediaRowEffect(db, mediaId);
});

const getUnitRowEffect = Effect.fn("MediaRepository.getUnitRow")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumber: number,
) {
  const row = yield* queryFirst("Failed to load episode", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
      .limit(1),
  );
  if (Option.isNone(row)) {
    return yield* new MediaNotFoundError({ message: "MediaUnit not found" });
  }
  return row.value;
});

const loadCurrentUnitStateEffect = Effect.fn("MediaRepository.loadCurrentUnitState")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumber: number,
) {
  const row = yield* queryFirst("Failed to load episode state", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
      .limit(1),
  );

  return Option.isSome(row)
    ? Option.some({
        downloaded: row.value.downloaded,
        ...(row.value.filePath == null ? {} : { filePath: row.value.filePath }),
      })
    : Option.none();
});

const findMediaByExactRootFolderEffect = Effect.fn("MediaRepository.findMediaByExactRootFolder")(
  function* (db: AppDatabase, rootFolder: string) {
    const rows = yield* tryDatabasePromise("Failed to find media by root folder", () =>
      db
        .select({ id: media.id, titleRomaji: media.titleRomaji })
        .from(media)
        .where(eq(media.rootFolder, rootFolder))
        .limit(1),
    );
    return rows[0];
  },
);

const findMediaRootFolderOwnerEffect = Effect.fn("MediaRepository.findMediaRootFolderOwner")(
  function* (db: AppDatabase, rootFolder: string) {
    const normalized = normalizeRootFolder(rootFolder);
    const rows = yield* tryDatabasePromise("Failed to find media root folder owner", () =>
      db
        .select({
          id: media.id,
          rootFolder: media.rootFolder,
          titleRomaji: media.titleRomaji,
        })
        .from(media),
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
  limit: number,
  nowIso: string,
) {
  const now = new Date(nowIso).toISOString();
  const rows = yield* tryDatabasePromise("Failed to load wanted mediaUnits", () =>
    db
      .select({
        mediaId: media.id,
        mediaTitle: media.titleRomaji,
        mediaKind: media.mediaKind,
        coverImage: media.coverImage,
        nextAiringAt: media.nextAiringAt,
        nextAiringUnit: media.nextAiringUnit,
        unitNumber: mediaUnits.number,
        title: mediaUnits.title,
        aired: mediaUnits.aired,
      })
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
      .limit(Math.max(1, limit)),
  );

  return rows.map((row) => {
    const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined, new Date(now));

    return {
      aired: row.aired ?? undefined,
      airing_status: timeline.airing_status,
      media_id: brandMediaId(row.mediaId),
      media_image: row.coverImage ?? undefined,
      media_title: row.mediaTitle,
      unit_kind: row.mediaKind === "anime" ? "episode" : "volume",
      unit_number: row.unitNumber,
      unit_title: row.title ?? undefined,
      is_future: timeline.is_future,
      next_airing_unit:
        row.nextAiringAt && row.nextAiringUnit
          ? {
              airing_at: row.nextAiringAt,
              unit_number: row.nextAiringUnit,
            }
          : undefined,
    } satisfies MissingUnit;
  });
});

const listMissingUnitSearchRowsEffect = Effect.fn("MediaRepository.listMissingUnitSearchRows")(
  function* (
    db: AppDatabase,
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

    return yield* tryDatabasePromise("Failed to queue missing-unit search", () =>
      db
        .select()
        .from(mediaUnits)
        .innerJoin(media, eq(media.id, mediaUnits.mediaId))
        .where(and(...missingConditions))
        .orderBy(media.titleRomaji, mediaUnits.number)
        .limit(Math.max(1, input.limit)),
    );
  },
);

const listCalendarEventsEffect = Effect.fn("MediaRepository.listCalendarEvents")(function* (
  db: AppDatabase,
  start: string,
  end: string,
  now: Date,
) {
  const nowIsoValue = now.toISOString();
  const rows = yield* tryDatabasePromise("Failed to load calendar events", () =>
    db
      .select()
      .from(mediaUnits)
      .innerJoin(media, eq(media.id, mediaUnits.mediaId))
      .where(and(sql`${mediaUnits.aired} >= ${start}`, sql`${mediaUnits.aired} <= ${end}`))
      .orderBy(mediaUnits.aired, media.titleRomaji),
  );

  return rows.map(({ media: mediaRow, media_units: episodeRow }) => {
    const timeline = deriveEpisodeTimelineMetadata(episodeRow.aired ?? undefined, now);

    return {
      all_day: isAllDayAiring(episodeRow.aired),
      end: episodeRow.aired ?? nowIsoValue,
      extended_props: {
        airing_status: timeline.airing_status,
        media_id: brandMediaId(mediaRow.id),
        media_image: mediaRow.coverImage ?? undefined,
        media_title: mediaRow.titleRomaji,
        downloaded: episodeRow.downloaded,
        unit_kind: mediaRow.mediaKind === "anime" ? "episode" : "volume",
        unit_number: episodeRow.number,
        unit_title: episodeRow.title ?? undefined,
        is_future: timeline.is_future,
      },
      id: `${mediaRow.id}-${episodeRow.number}`,
      start: episodeRow.aired ?? nowIsoValue,
      title: buildCalendarEventTitle(mediaRow.titleRomaji, episodeRow, mediaRow.mediaKind),
    } satisfies CalendarEvent;
  });
});

const listMappedUnitRowsEffect = Effect.fn("MediaRepository.listMappedUnitRows")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  return yield* tryDatabasePromise("Failed to load mediaUnits for rename preview", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), sql`${mediaUnits.filePath} is not null`)),
  );
});

const listImportScanMappedUnitsEffect = Effect.fn("MediaRepository.listImportScanMappedUnits")(
  function* (
    db: AppDatabase,
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
      return [] as const;
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
      return [] as const;
    }

    return yield* tryDatabasePromise("Failed to scan import path", () =>
      db
        .select({
          media_id: mediaUnits.mediaId,
          media_title: media.titleRomaji,
          unit_number: mediaUnits.number,
          file_path: mediaUnits.filePath,
        })
        .from(mediaUnits)
        .innerJoin(media, eq(mediaUnits.mediaId, media.id))
        .where(whereClause),
    );
  },
);

const listScopedUnitRowsEffect = Effect.fn("MediaRepository.listScopedUnitRows")(function* (
  db: AppDatabase,
  input: {
    readonly mediaIds: readonly number[];
    readonly unitNumbers: readonly number[];
  },
) {
  if (input.mediaIds.length === 0 || input.unitNumbers.length === 0) {
    return [] as const;
  }

  return yield* tryDatabasePromise("Failed to scan import path", () =>
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
      ),
  );
});

const mediaExistsEffect = Effect.fn("MediaRepository.mediaExists")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to check library status", () =>
    db.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).limit(1),
  );
  return rows.length > 0;
});

const findExistingMediaIdsEffect = Effect.fn("MediaRepository.findExistingMediaIds")(function* (
  db: AppDatabase,
  mediaIds: readonly number[],
) {
  if (mediaIds.length === 0) {
    return new Set<number>();
  }
  const rows = yield* tryDatabasePromise("Failed to mark search results in library", () =>
    db
      .select({ id: media.id })
      .from(media)
      .where(inArray(media.id, [...mediaIds])),
  );
  return new Set(rows.map((row) => row.id));
});

const listAllMediaRowsEffect = Effect.fn("MediaRepository.listAllMediaRows")(function* (
  db: AppDatabase,
) {
  return yield* tryDatabasePromise("Failed to list all media", () =>
    db.select().from(media).orderBy(media.id),
  );
});

const listMediaRowsEffect = Effect.fn("MediaRepository.listMediaRows")(function* (
  db: AppDatabase,
  input: { readonly monitored?: boolean; readonly limit: number; readonly offset: number },
) {
  const monitoredCondition =
    input.monitored !== undefined ? eq(media.monitored, input.monitored) : undefined;
  return yield* tryDatabasePromise("Failed to list media", () => {
    const baseQuery = db.select().from(media);
    const query = monitoredCondition ? baseQuery.where(monitoredCondition) : baseQuery;
    return query.orderBy(media.id).limit(input.limit).offset(input.offset);
  });
});

const countMediaEffect = Effect.fn("MediaRepository.countMedia")(function* (
  db: AppDatabase,
  input: { readonly monitored?: boolean },
) {
  const monitoredCondition =
    input.monitored !== undefined ? eq(media.monitored, input.monitored) : undefined;
  const rows = yield* tryDatabasePromise("Failed to count media", () => {
    const countQuery = db.select({ count: count() }).from(media);
    return monitoredCondition ? countQuery.where(monitoredCondition) : countQuery;
  });
  return rows[0]?.count ?? 0;
});

const listUnitRowsByMediaIdEffect = Effect.fn("MediaRepository.listUnitRowsByMediaId")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  return yield* tryDatabasePromise("Failed to load media", () =>
    db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)),
  );
});

const listUnitRowsWithMediaKindEffect = Effect.fn("MediaRepository.listUnitRowsWithMediaKind")(
  function* (db: AppDatabase, mediaId: number) {
    return yield* tryDatabasePromise("Failed to list mediaUnits", () =>
      db
        .select({ episode: mediaUnits, mediaKind: media.mediaKind })
        .from(mediaUnits)
        .innerJoin(media, eq(media.id, mediaUnits.mediaId))
        .where(eq(mediaUnits.mediaId, mediaId)),
    );
  },
);

const listUnitProgressStatsEffect = Effect.fn("MediaRepository.listUnitProgressStats")(function* (
  db: AppDatabase,
  mediaIds: readonly number[],
) {
  if (mediaIds.length === 0) {
    return [] as readonly MediaUnitProgressStat[];
  }
  return yield* tryDatabasePromise("Failed to list media", () =>
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
      .groupBy(mediaUnits.mediaId),
  );
});

const listMissingUnitNumbersEffect = Effect.fn("MediaRepository.listMissingUnitNumbers")(function* (
  db: AppDatabase,
  mediaIds: readonly number[],
) {
  if (mediaIds.length === 0) {
    return [] as readonly { readonly mediaId: number; readonly number: number }[];
  }
  return yield* tryDatabasePromise("Failed to list media", () =>
    db
      .select({
        mediaId: mediaUnits.mediaId,
        number: mediaUnits.number,
      })
      .from(mediaUnits)
      .where(and(inArray(mediaUnits.mediaId, [...mediaIds]), eq(mediaUnits.downloaded, false))),
  );
});

const loadUnitsByNumbersEffect = Effect.fn("MediaRepository.loadUnitsByNumbers")(function* (
  db: AppDatabase,
  mediaId: number,
  numbers: readonly number[],
) {
  if (numbers.length === 0) {
    return [] as readonly (typeof mediaUnits.$inferSelect)[];
  }

  return yield* tryDatabasePromise("Failed to load media units", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), inArray(mediaUnits.number, [...numbers]))),
  );
});

const updateMonitoredEffect = Effect.fn("MediaRepository.updateMonitored")(function* (
  db: AppDatabase,
  mediaId: number,
  monitored: boolean,
) {
  yield* tryDatabasePromise("Failed to update media", () =>
    db.update(media).set({ monitored }).where(eq(media.id, mediaId)),
  );
});

const updateRootFolderEffect = Effect.fn("MediaRepository.updateRootFolder")(function* (
  db: AppDatabase,
  mediaId: number,
  rootFolder: string,
) {
  yield* tryDatabasePromise("Failed to update media path", () =>
    db.update(media).set({ rootFolder }).where(eq(media.id, mediaId)),
  );
});

const updateProfileNameEffect = Effect.fn("MediaRepository.updateProfileName")(function* (
  db: AppDatabase,
  mediaId: number,
  profileName: string,
) {
  yield* tryDatabasePromise("Failed to update media", () =>
    db.update(media).set({ profileName }).where(eq(media.id, mediaId)),
  );
});

const updateReleaseProfileIdsEffect = Effect.fn("MediaRepository.updateReleaseProfileIds")(
  function* (db: AppDatabase, mediaId: number, releaseProfileIds: string) {
    yield* tryDatabasePromise("Failed to update media", () =>
      db.update(media).set({ releaseProfileIds }).where(eq(media.id, mediaId)),
    );
  },
);

const insertMediaAggregateEffect = Effect.fn("MediaRepository.insertMediaAggregate")(function* (
  db: AppDatabase,
  input: {
    readonly mediaRow: typeof media.$inferInsert;
    readonly unitRows: readonly (typeof mediaUnits.$inferInsert)[];
    readonly log: typeof systemLogs.$inferInsert;
  },
) {
  yield* tryDatabasePromise("Failed to insert media aggregate", () =>
    db.transaction(async (tx) => {
      await tx.insert(media).values(input.mediaRow);

      if (input.unitRows.length > 0) {
        await tx.insert(mediaUnits).values([...input.unitRows]);
      }

      await tx.insert(systemLogs).values(input.log);
    }),
  );
});

const updateMediaRowEffect = Effect.fn("MediaRepository.updateMediaRow")(function* (
  db: AppDatabase,
  mediaId: number,
  row: typeof media.$inferInsert | Partial<typeof media.$inferInsert>,
) {
  yield* tryDatabasePromise("Failed to update media", () =>
    db.update(media).set(row).where(eq(media.id, mediaId)),
  );
});

const deleteMediaEffect = Effect.fn("MediaRepository.deleteMedia")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  yield* tryDatabasePromise("Failed to delete media", () =>
    db.delete(media).where(eq(media.id, mediaId)),
  );
});

const listMonitoredMediaIdsEffect = Effect.fn("MediaRepository.listMonitoredMediaIds")(function* (
  db: AppDatabase,
) {
  const rows = yield* tryDatabasePromise("Failed to list monitored media ids", () =>
    db.select({ id: media.id }).from(media).where(eq(media.monitored, true)),
  );
  return rows.map((row) => row.id);
});

function isAllDayAiring(aired?: string | null) {
  return !aired?.includes("T");
}

function buildCalendarEventTitle(
  mediaTitle: string,
  episodeRow: { number: number; title: string | null },
  mediaKind: string,
) {
  const unitLabel = mediaKind === "anime" ? "MediaUnit" : "Volume";

  return episodeRow.title
    ? `${mediaTitle} - ${unitLabel} ${episodeRow.number}: ${episodeRow.title}`
    : `${mediaTitle} - ${unitLabel} ${episodeRow.number}`;
}

function normalizeRootFolder(rootFolder: string) {
  if (rootFolder === "/") {
    return "/";
  }

  return rootFolder.replace(/\/+$/, "");
}
