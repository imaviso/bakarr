import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { qualityProfiles } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { tryDatabase } from "@/infra/effect/db.ts";
import { qualityProfileExistsEffect } from "@/features/media/shared/profile-support.ts";
import { makeQualityProfileRepository } from "@/test/repository-factories.ts";

it.effect("qualityProfileExistsEffect returns true for existing profile", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* tryDatabase("Failed to seed quality profile 'HD'", () =>
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
        const exists = yield* qualityProfileExistsEffect(makeQualityProfileRepository(db), "HD");
        assert.deepStrictEqual(exists, true);
      }),
  }),
);

it.effect("qualityProfileExistsEffect returns false for non-existent profile", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const exists = yield* qualityProfileExistsEffect(
          makeQualityProfileRepository(db),
          "Missing",
        );
        assert.deepStrictEqual(exists, false);
      }),
  }),
);

it.effect("qualityProfileExistsEffect is case sensitive", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* tryDatabase("Failed to seed quality profile 'Default'", () =>
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
        const exists = yield* qualityProfileExistsEffect(
          makeQualityProfileRepository(db),
          "default",
        );
        assert.deepStrictEqual(exists, false);
      }),
  }),
);
