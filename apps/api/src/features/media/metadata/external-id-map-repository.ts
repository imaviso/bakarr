import { eq, inArray, or } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { externalIdMap } from "@/db/schema.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { Semaphore } from "effect";

export interface ExternalIdMapping {
  readonly anilistId: number;
  readonly malId?: number | undefined;
  readonly anidbAid?: number | undefined;
  readonly updatedAt: string;
}

export interface ExternalIdMapRepositoryShape {
  readonly loadByAniListId: (
    anilistId: number,
  ) => Effect.Effect<Option.Option<ExternalIdMapping>, DatabaseError>;
  readonly loadByMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<ExternalIdMapping>, DatabaseError>;
  readonly loadByAnidbAid: (
    anidbAid: number,
  ) => Effect.Effect<Option.Option<ExternalIdMapping>, DatabaseError>;
  // Dual-space lookup: one query matching either side. Callers disambiguate
  // via the row (row.anilistId === id → AniList side, else MAL side) instead
  // of maintaining separate check-anilist-then-mal copies.
  readonly loadByEitherId: (
    id: number,
  ) => Effect.Effect<Option.Option<ExternalIdMapping>, DatabaseError>;
  readonly loadByEitherIds: (
    ids: ReadonlyArray<number>,
  ) => Effect.Effect<ReadonlyArray<ExternalIdMapping>, DatabaseError>;
  readonly deleteByAniListId: (anilistId: number) => Effect.Effect<void, DatabaseError>;
  readonly upsert: (input: {
    readonly anilistId: number;
    readonly malId?: number | undefined;
    readonly anidbAid?: number | undefined;
  }) => Effect.Effect<void, DatabaseError>;
}

export class ExternalIdMapRepository extends Context.Service<
  ExternalIdMapRepository,
  ExternalIdMapRepositoryShape
>()("@bakarr/api/ExternalIdMapRepository") {
  static readonly layer = Layer.effect(
    ExternalIdMapRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      // Serializes read-merge-write upserts so concurrent {malId}/{anidbAid}
      // writers for one anilistId cannot clobber each other's learned ids.
      const writeLock = yield* Semaphore.make(1);
      return makeExternalIdMapRepositoryShape(db, sqlClient, writeLock);
    }),
  );
}

export function makeExternalIdMapRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
  writeLock: Semaphore.Semaphore,
): ExternalIdMapRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    loadByAniListId: (anilistId) => loadByAniListId(db, exec, anilistId),
    loadByEitherId: (id) => loadByEitherId(db, exec, id),
    loadByEitherIds: (ids) => loadByEitherIds(db, exec, ids),
    loadByMalId: (malId) => loadByMalId(db, exec, malId),
    loadByAnidbAid: (anidbAid) => loadByAnidbAid(db, exec, anidbAid),
    deleteByAniListId: (anilistId) =>
      writeLock.withPermits(1)(deleteByAniListId(db, exec, anilistId)),
    upsert: (input) => writeLock.withPermits(1)(upsertMapping(db, exec, input)),
  };
}

const toMapping = (row: {
  readonly anilistId: number;
  readonly malId: number | null;
  readonly anidbAid: number | null;
  readonly updatedAt: string;
}): ExternalIdMapping => ({
  anilistId: row.anilistId,
  ...(row.malId === null ? {} : { malId: row.malId }),
  ...(row.anidbAid === null ? {} : { anidbAid: row.anidbAid }),
  updatedAt: row.updatedAt,
});

const loadByAniListId = Effect.fn("ExternalIdMapRepository.loadByAniListId")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  anilistId: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load external id mapping",
    db
      .select({
        anilistId: externalIdMap.anilistId,
        malId: externalIdMap.malId,
        anidbAid: externalIdMap.anidbAid,
        updatedAt: externalIdMap.updatedAt,
      })
      .from(externalIdMap)
      .where(eq(externalIdMap.anilistId, anilistId))
      .limit(1)
      .prepare()
      .effect(),
  );

  const row = rows[0];
  return row === undefined ? Option.none<ExternalIdMapping>() : Option.some(toMapping(row));
});

const loadByMalId = Effect.fn("ExternalIdMapRepository.loadByMalId")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  malId: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load external id mapping",
    db
      .select({
        anilistId: externalIdMap.anilistId,
        malId: externalIdMap.malId,
        anidbAid: externalIdMap.anidbAid,
        updatedAt: externalIdMap.updatedAt,
      })
      .from(externalIdMap)
      .where(eq(externalIdMap.malId, malId))
      .limit(1)
      .prepare()
      .effect(),
  );

  const row = rows[0];
  return row === undefined ? Option.none<ExternalIdMapping>() : Option.some(toMapping(row));
});

const loadByAnidbAid = Effect.fn("ExternalIdMapRepository.loadByAnidbAid")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  anidbAid: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load external id mapping",
    db
      .select({
        anilistId: externalIdMap.anilistId,
        malId: externalIdMap.malId,
        anidbAid: externalIdMap.anidbAid,
        updatedAt: externalIdMap.updatedAt,
      })
      .from(externalIdMap)
      .where(eq(externalIdMap.anidbAid, anidbAid))
      .limit(1)
      .prepare()
      .effect(),
  );

  const row = rows[0];
  return row === undefined ? Option.none<ExternalIdMapping>() : Option.some(toMapping(row));
});

const loadByEitherId = Effect.fn("ExternalIdMapRepository.loadByEitherId")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  id: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to load external id mapping",
    db
      .select({
        anilistId: externalIdMap.anilistId,
        malId: externalIdMap.malId,
        anidbAid: externalIdMap.anidbAid,
        updatedAt: externalIdMap.updatedAt,
      })
      .from(externalIdMap)
      .where(or(eq(externalIdMap.anilistId, id), eq(externalIdMap.malId, id)))
      .limit(2)
      .prepare()
      .effect(),
  );

  // Prefer the AniList-side row when both sides numerically collide across rows.
  const anilistSide = rows.find((row) => row.anilistId === id);
  const row = anilistSide ?? rows[0];
  return row === undefined ? Option.none<ExternalIdMapping>() : Option.some(toMapping(row));
});

const loadByEitherIds = Effect.fn("ExternalIdMapRepository.loadByEitherIds")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  ids: ReadonlyArray<number>,
) {
  if (ids.length === 0) {
    return [];
  }

  const rows = yield* exec.runQuery(
    "Failed to load external id mappings",
    db
      .select({
        anilistId: externalIdMap.anilistId,
        malId: externalIdMap.malId,
        anidbAid: externalIdMap.anidbAid,
        updatedAt: externalIdMap.updatedAt,
      })
      .from(externalIdMap)
      .where(or(inArray(externalIdMap.anilistId, [...ids]), inArray(externalIdMap.malId, [...ids])))
      .prepare()
      .effect(),
  );

  return rows.map(toMapping);
});

const deleteByAniListId = Effect.fn("ExternalIdMapRepository.deleteByAniListId")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  anilistId: number,
) {
  yield* exec.runQuery(
    "Failed to delete external id mapping",
    db.delete(externalIdMap).where(eq(externalIdMap.anilistId, anilistId)).prepare().effect(),
  );
});

const upsertMapping = Effect.fn("ExternalIdMapRepository.upsert")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly anilistId: number;
    readonly malId?: number | undefined;
    readonly anidbAid?: number | undefined;
  },
) {
  const updatedAt = yield* currentNowIso();
  const existing = yield* loadByAniListId(db, exec, input.anilistId);

  const malId = input.malId ?? (Option.isSome(existing) ? existing.value.malId : undefined);
  const anidbAid =
    input.anidbAid ?? (Option.isSome(existing) ? existing.value.anidbAid : undefined);

  yield* exec.runQuery(
    "Failed to upsert external id mapping",
    db
      .insert(externalIdMap)
      .values({
        anilistId: input.anilistId,
        malId: malId ?? null,
        anidbAid: anidbAid ?? null,
        updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          malId: malId ?? null,
          anidbAid: anidbAid ?? null,
          updatedAt,
        },
        target: externalIdMap.anilistId,
      })
      .prepare()
      .effect(),
  );
});
