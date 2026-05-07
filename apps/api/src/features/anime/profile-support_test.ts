import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import * as schema from "@/db/schema.ts";
import { qualityProfiles } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { qualityProfileExistsEffect } from "@/features/anime/profile-support.ts";

it.scoped("qualityProfileExistsEffect returns true for existing profile", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(qualityProfiles).values({
            allowedQualities: "[]",
            cutoff: "1080p",
            maxSize: null,
            minSize: null,
            name: "HD",
            seadexPreferred: true,
            upgradeAllowed: false,
          }),
        );
        const exists = yield* qualityProfileExistsEffect(db, "HD");
        assert.deepStrictEqual(exists, true);
      }),
    schema,
  }),
);

it.scoped("qualityProfileExistsEffect returns false for non-existent profile", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const exists = yield* qualityProfileExistsEffect(db, "Missing");
        assert.deepStrictEqual(exists, false);
      }),
    schema,
  }),
);

it.scoped("qualityProfileExistsEffect is case sensitive", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(qualityProfiles).values({
            allowedQualities: "[]",
            cutoff: "1080p",
            maxSize: null,
            minSize: null,
            name: "Default",
            seadexPreferred: false,
            upgradeAllowed: true,
          }),
        );
        const exists = yield* qualityProfileExistsEffect(db, "default");
        assert.deepStrictEqual(exists, false);
      }),
    schema,
  }),
);
