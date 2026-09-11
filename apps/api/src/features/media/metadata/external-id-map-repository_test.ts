import { assert, it } from "@effect/vitest";
import { Effect, Option, Semaphore } from "effect";

import * as schema from "@/db/schema.ts";
import { makeExternalIdMapRepositoryShape } from "@/features/media/metadata/external-id-map-repository.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.effect("loadByEitherId resolves both id spaces to one row", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const repository = makeExternalIdMapRepositoryShape(db, client, yield* Semaphore.make(1));

        yield* repository.upsert({ anilistId: 1001, malId: 606, anidbAid: 42 });

        const byAnilist = yield* repository.loadByEitherId(1001);
        const byMal = yield* repository.loadByEitherId(606);
        const missing = yield* repository.loadByEitherId(999001);

        assert.deepStrictEqual(Option.isSome(byAnilist), true);
        assert.deepStrictEqual(Option.isSome(byMal), true);
        if (Option.isSome(byAnilist) && Option.isSome(byMal)) {
          assert.deepStrictEqual(byAnilist.value, byMal.value);
          assert.deepStrictEqual(byAnilist.value.anilistId, 1001);
          assert.deepStrictEqual(byAnilist.value.malId, 606);
          assert.deepStrictEqual(byAnilist.value.anidbAid, 42);
        }
        assert.deepStrictEqual(Option.isNone(missing), true);
      }),
    schema,
  }),
);
