import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import * as schema from "@/db/schema.ts";
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
  it.effect("round-trips metadata within the TTL", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db, _file, client) =>
        Effect.gen(function* () {
          const repo = makeAniListDetailCacheRepositoryShape(db, client);
          const nowMs = 1_000_000;

          yield* repo.write(1001, "anime", makeMetadata(1001), nowMs);

          assert.deepStrictEqual(yield* repo.read(1001, "anime", nowMs), makeMetadata(1001));
        }),
    }),
  );

  it.effect("returns null past the TTL but keeps the stale row", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db, _file, client) =>
        Effect.gen(function* () {
          const repo = makeAniListDetailCacheRepositoryShape(db, client);

          yield* repo.write(1002, "anime", makeMetadata(1002), 0);

          assert.deepStrictEqual(
            yield* repo.read(1002, "anime", ANILIST_DETAIL_CACHE_TTL_MS + 1),
            null,
          );
          assert.deepStrictEqual(
            yield* repo.readStale(1002, "anime"),
            makeMetadata(1002),
          );
        }),
    }),
  );

  it.effect("rejects rows fetched under a different media kind", () =>
    withSqliteTestDbEffect({
      schema,
      run: (db, _file, client) =>
        Effect.gen(function* () {
          const repo = makeAniListDetailCacheRepositoryShape(db, client);

          yield* repo.write(1003, "manga", makeMetadata(1003), 1_000_000);

          assert.deepStrictEqual(yield* repo.read(1003, "anime", 1_000_000), null);
          assert.deepStrictEqual(yield* repo.readStale(1003, "anime"), null);
          assert.deepStrictEqual(
            yield* repo.read(1003, undefined, 1_000_000),
            makeMetadata(1003),
          );
        }),
    }),
  );
});
