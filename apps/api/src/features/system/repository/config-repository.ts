import { count, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../../db/database.ts";
import { anime, appConfig, qualityProfiles, releaseProfiles } from "../../../db/schema.ts";
import { tryDatabasePromise } from "../../../lib/effect-db.ts";

export const loadSystemConfigRow = Effect.fn("SystemConfigRepository.loadSystemConfigRow")(
  function* (db: AppDatabase) {
    const rows = yield* tryDatabasePromise("Failed to load system config", () =>
      db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
    );

    return rows[0];
  },
);

export const insertSystemConfigRow = Effect.fn("SystemConfigRepository.insertSystemConfigRow")(
  function* (db: AppDatabase, input: typeof appConfig.$inferInsert) {
    yield* tryDatabasePromise("Failed to insert system config", () =>
      db.insert(appConfig).values(input),
    );
  },
);

export const upsertSystemConfigRow = Effect.fn("SystemConfigRepository.upsertSystemConfigRow")(
  function* (db: AppDatabase, input: typeof appConfig.$inferInsert) {
    yield* tryDatabasePromise("Failed to upsert system config", () =>
      db
        .insert(appConfig)
        .values(input)
        .onConflictDoUpdate({
          target: appConfig.id,
          set: { data: input.data, updatedAt: input.updatedAt },
        }),
    );
  },
);

export const updateSystemConfigAtomic = Effect.fn(
  "SystemConfigRepository.updateSystemConfigAtomic",
)(function* (
  db: AppDatabase,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* tryDatabasePromise("Failed to update system config", () =>
    db.transaction(async (tx) => {
      await tx
        .insert(appConfig)
        .values(coreInput)
        .onConflictDoUpdate({
          target: appConfig.id,
          set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
        });

      await tx.delete(qualityProfiles);

      if (profileRows.length > 0) {
        await tx.insert(qualityProfiles).values([...profileRows]);
      }
    }),
  );
});

export const loadAnyQualityProfileRow = Effect.fn(
  "SystemConfigRepository.loadAnyQualityProfileRow",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
    db.select().from(qualityProfiles).limit(1),
  );

  return rows[0];
});

export const listQualityProfileRows = Effect.fn("SystemConfigRepository.listQualityProfileRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabasePromise("Failed to list quality profiles", () =>
      db.select().from(qualityProfiles).orderBy(qualityProfiles.name),
    );
  },
);

export const insertQualityProfileRow = Effect.fn("SystemConfigRepository.insertQualityProfileRow")(
  function* (db: AppDatabase, row: typeof qualityProfiles.$inferInsert) {
    yield* tryDatabasePromise("Failed to insert quality profile", () =>
      db.insert(qualityProfiles).values(row),
    );
  },
);

export const insertQualityProfileRows = Effect.fn(
  "SystemConfigRepository.insertQualityProfileRows",
)(function* (db: AppDatabase, rows: readonly (typeof qualityProfiles.$inferInsert)[]) {
  if (rows.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to insert quality profiles", () =>
    db.insert(qualityProfiles).values([...rows]),
  );
});

export const loadQualityProfileRow = Effect.fn("SystemConfigRepository.loadQualityProfileRow")(
  function* (db: AppDatabase, name: string) {
    const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
      db.select().from(qualityProfiles).where(eq(qualityProfiles.name, name)).limit(1),
    );

    return rows[0];
  },
);

export const updateQualityProfileRow = Effect.fn("SystemConfigRepository.updateQualityProfileRow")(
  function* (db: AppDatabase, name: string, row: typeof qualityProfiles.$inferInsert) {
    yield* tryDatabasePromise("Failed to update quality profile", () =>
      db.update(qualityProfiles).set(row).where(eq(qualityProfiles.name, name)),
    );
  },
);

export const renameQualityProfileWithCascade = Effect.fn(
  "SystemConfigRepository.renameQualityProfileWithCascade",
)(function* (db: AppDatabase, oldName: string, row: typeof qualityProfiles.$inferInsert) {
  yield* tryDatabasePromise("Failed to rename quality profile", () =>
    db.transaction(async (tx) => {
      await tx.update(qualityProfiles).set(row).where(eq(qualityProfiles.name, oldName));

      if (oldName !== row.name) {
        await tx.update(anime).set({ profileName: row.name }).where(eq(anime.profileName, oldName));
      }
    }),
  );
});

export const deleteQualityProfileRow = Effect.fn("SystemConfigRepository.deleteQualityProfileRow")(
  function* (db: AppDatabase, name: string) {
    yield* tryDatabasePromise("Failed to delete quality profile", () =>
      db.delete(qualityProfiles).where(eq(qualityProfiles.name, name)),
    );
  },
);

export const listReleaseProfileRows = Effect.fn("SystemConfigRepository.listReleaseProfileRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabasePromise("Failed to list release profiles", () =>
      db.select().from(releaseProfiles).orderBy(releaseProfiles.id),
    );
  },
);

export const insertReleaseProfileRow = Effect.fn("SystemConfigRepository.insertReleaseProfileRow")(
  function* (db: AppDatabase, row: typeof releaseProfiles.$inferInsert) {
    const rows = yield* tryDatabasePromise("Failed to insert release profile", () =>
      db.insert(releaseProfiles).values(row).returning(),
    );

    return rows[0]!;
  },
);

export const updateReleaseProfileRow = Effect.fn("SystemConfigRepository.updateReleaseProfileRow")(
  function* (db: AppDatabase, id: number, row: Partial<typeof releaseProfiles.$inferInsert>) {
    yield* tryDatabasePromise("Failed to update release profile", () =>
      db.update(releaseProfiles).set(row).where(eq(releaseProfiles.id, id)),
    );
  },
);

export const deleteReleaseProfileRow = Effect.fn("SystemConfigRepository.deleteReleaseProfileRow")(
  function* (db: AppDatabase, id: number) {
    yield* tryDatabasePromise("Failed to delete release profile", () =>
      db.delete(releaseProfiles).where(eq(releaseProfiles.id, id)),
    );
  },
);

export const countAnimeUsingProfile = Effect.fn("SystemConfigRepository.countAnimeUsingProfile")(
  function* (db: AppDatabase, profileName: string) {
    const [{ value }] = yield* tryDatabasePromise("Failed to count anime", () =>
      db.select({ value: count() }).from(anime).where(eq(anime.profileName, profileName)),
    );

    return value;
  },
);
