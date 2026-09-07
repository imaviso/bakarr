import { Context, Effect, Layer, Schema } from "effect";
import { eq } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { anilistDetailCache } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import { AnimeMetadataSchema } from "@/features/media/metadata/metadata-model.ts";

// Detail payloads are near-immutable (titles, counts); airing schedules shift,
// but the refresh job revalidates on every cycle while upstream is alive, so a
// long TTL only bounds staleness during outages.
export const ANILIST_DETAIL_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const AnimeMetadataJsonSchema = Schema.fromJsonString(AnimeMetadataSchema);
const decodeAnimeMetadata = Schema.decodeUnknownEffect(AnimeMetadataJsonSchema);
const encodeAnimeMetadata = Schema.encodeUnknownEffect(AnimeMetadataJsonSchema);

export interface AniListDetailCacheRepositoryShape {
  readonly read: (
    mediaId: number,
    mediaKind: string | undefined,
    nowMs: number,
  ) => Effect.Effect<AnimeMetadata | null, DatabaseError>;
  readonly readStale: (
    mediaId: number,
    mediaKind: string | undefined,
  ) => Effect.Effect<AnimeMetadata | null, DatabaseError>;
  readonly write: (
    mediaId: number,
    mediaKind: string,
    metadata: AnimeMetadata,
    nowMs: number,
  ) => Effect.Effect<void, DatabaseError>;
}

export class AniListDetailCacheRepository extends Context.Service<
  AniListDetailCacheRepository,
  AniListDetailCacheRepositoryShape
>()("@bakarr/api/AniListDetailCacheRepository") {
  static readonly layer = Layer.effect(
    AniListDetailCacheRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeAniListDetailCacheRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeAniListDetailCacheRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): AniListDetailCacheRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    read: (mediaId, mediaKind, nowMs) =>
      readAniListDetailCacheEffect(db, exec, mediaId, mediaKind, nowMs),
    readStale: (mediaId, mediaKind) =>
      readStaleAniListDetailCacheEffect(db, exec, mediaId, mediaKind),
    write: (mediaId, mediaKind, metadata, nowMs) =>
      writeAniListDetailCacheEffect(db, exec, mediaId, mediaKind, metadata, nowMs),
  } satisfies AniListDetailCacheRepositoryShape;
}

const readAniListDetailCacheEffect = Effect.fn("AniListDetailCacheRepository.read")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  mediaKind: string | undefined,
  nowMs: number,
) {
  const cached = yield* readAniListDetailCacheRowEffect(db, exec, mediaId, mediaKind);

  if (cached && nowMs - cached.fetchedAtMs < ANILIST_DETAIL_CACHE_TTL_MS) {
    return yield* decodeAniListDetailCachePayloadEffect(cached.payload);
  }

  return null;
});

const readStaleAniListDetailCacheEffect = Effect.fn("AniListDetailCacheRepository.readStale")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    mediaId: number,
    mediaKind: string | undefined,
  ) {
    const cached = yield* readAniListDetailCacheRowEffect(db, exec, mediaId, mediaKind);

    if (!cached) {
      return null;
    }

    return yield* decodeAniListDetailCachePayloadEffect(cached.payload);
  },
);

const readAniListDetailCacheRowEffect = Effect.fn("AniListDetailCacheRepository.readRow")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    mediaId: number,
    mediaKind: string | undefined,
  ) {
    const cachedRows = yield* exec.runQuery(
      "Failed to load AniList detail cache",
      db
        .select({
          mediaKind: anilistDetailCache.mediaKind,
          payload: anilistDetailCache.payload,
          fetchedAtMs: anilistDetailCache.fetchedAtMs,
        })
        .from(anilistDetailCache)
        .where(eq(anilistDetailCache.mediaId, mediaId))
        .limit(1)
        .prepare()
        .effect(),
    );

    const row = cachedRows[0] ?? null;

    // The AniList `type` variable depends on kind; a row fetched as manga must
    // not satisfy an anime lookup.
    if (row && mediaKind !== undefined && row.mediaKind !== mediaKind) {
      return null;
    }

    return row;
  },
);

const decodeAniListDetailCachePayloadEffect = Effect.fn(
  "AniListDetailCacheRepository.decodePayload",
)(function* (payload: string) {
  return yield* decodeAnimeMetadata(payload).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to decode AniList detail cache payload",
        }),
    ),
  );
});

const writeAniListDetailCacheEffect = Effect.fn("AniListDetailCacheRepository.write")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
  mediaKind: string,
  metadata: AnimeMetadata,
  nowMs: number,
) {
  const encodedPayload = yield* encodeAnimeMetadata(metadata).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to encode AniList detail cache payload",
        }),
    ),
  );

  yield* exec.runQuery(
    "Failed to upsert AniList detail cache",
    db
      .insert(anilistDetailCache)
      .values({
        mediaId,
        mediaKind,
        payload: encodedPayload,
        fetchedAtMs: nowMs,
      })
      .onConflictDoUpdate({
        target: anilistDetailCache.mediaId,
        set: {
          mediaKind,
          payload: encodedPayload,
          fetchedAtMs: nowMs,
        },
      })
      .prepare()
      .effect(),
  );
});
