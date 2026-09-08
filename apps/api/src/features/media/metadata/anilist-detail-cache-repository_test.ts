import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { eq } from "drizzle-orm";

import * as schema from "@/db/schema.ts";
import { anilistDetailCache } from "@/db/schema.ts";
import {
  ANILIST_DETAIL_CACHE_TTL_MS,
  makeAniListDetailCacheRepositoryShape,
} from "@/features/media/metadata/anilist-detail-cache-repository.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

function makeMetadata(id: number): AnimeMetadata {
  return {
    genres: [],
    unitCount: 12,
    format: "TV",
    id,
    malId: id,
    status: "RELEASING",
    synonyms: [],
    title: { romaji: "Cached Media" },
  };
}

describe("AniListDetailCacheRepository", () => {
  it.effect("round-trips live metadata within the TTL", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db, _file, client) =>
        Effect.gen(function* () {
          const repo = makeAniListDetailCacheRepositoryShape(db, client);
          const nowMs = 1_000_000;

          yield* repo.write(1001, "anime", makeMetadata(1001), nowMs);

          assert.deepStrictEqual(yield* repo.read(1001, nowMs), {
            data: makeMetadata(1001),
            origin: "live",
          });
        }),
    }),
  );

  it.effect("serves stale metadata past the TTL without extending the window", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db, _file, client) =>
        Effect.gen(function* () {
          const repo = makeAniListDetailCacheRepositoryShape(db, client);

          yield* repo.write(1002, "anime", makeMetadata(1002), 0);

          assert.deepStrictEqual(yield* repo.read(1002, ANILIST_DETAIL_CACHE_TTL_MS + 1), {
            data: makeMetadata(1002),
            origin: "stale",
          });
        }),
    }),
  );

  it.effect("treats corrupt payloads as a miss so remote refetch heals the row", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db, _file, client) =>
        Effect.gen(function* () {
          const repo = makeAniListDetailCacheRepositoryShape(db, client);

          yield* repo.write(1003, "anime", makeMetadata(1003), 1_000_000);
          yield* db
            .update(anilistDetailCache)
            .set({ payload: "not-json" })
            .where(eq(anilistDetailCache.mediaId, 1003))
            .prepare()
            .effect();

          assert.deepStrictEqual(yield* repo.read(1003, 1_000_000), null);
        }),
    }),
  );

  it.effect("returns null when no row exists", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db, _file, client) =>
        Effect.gen(function* () {
          const repo = makeAniListDetailCacheRepositoryShape(db, client);

          assert.deepStrictEqual(yield* repo.read(1004, 1_000_000), null);
        }),
    }),
  );
});
