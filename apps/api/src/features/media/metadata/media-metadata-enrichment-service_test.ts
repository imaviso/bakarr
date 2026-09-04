import type * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import * as TestClock from "effect/testing/TestClock";
import { Effect, Layer, Ref } from "effect";
import { assert, it } from "@effect/vitest";

import * as schema from "@/db/schema.ts";
import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { AniDbClient } from "@/features/media/metadata/anidb.ts";
import type {
  AniDbEpisodeLookupInput,
  AniDbEpisodeLookupResult,
} from "@/features/media/metadata/anidb-protocol.ts";
import {
  MediaMetadataEnrichmentService,
  type MediaMetadataEnrichmentCacheState,
} from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import {
  makeAniDbUnitCacheRepository,
  makeMediaRepository,
  makeMediaUnitRepository,
} from "@/test/repository-factories.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

function makeEnrichmentLayer(
  db: AppDatabase,
  client: NodeSqliteClient.SqliteClient,
  lookup: typeof AniDbClient.Service,
) {
  return MediaMetadataEnrichmentService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(AniDbClient, lookup),
        Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.of(db)),
        Layer.succeed(AniDbUnitCacheRepository, makeAniDbUnitCacheRepository(db, client)),
        Layer.succeed(MediaRepository, makeMediaRepository(db, client)),
        Layer.succeed(MediaUnitRepository, makeMediaUnitRepository(db, client)),
      ),
    ),
  );
}

it.effect("transient AniDB skip does not poison the cache", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const lookupCallsRef = yield* Ref.make(0);
        const skippedLookup = (
          _input: AniDbEpisodeLookupInput,
        ): Effect.Effect<AniDbEpisodeLookupResult> => {
          const skipped: AniDbEpisodeLookupResult = {
            _tag: "AniDbLookupSkipped",
            reason: "disabled",
          };
          return Ref.update(lookupCallsRef, (count) => count + 1).pipe(Effect.as(skipped));
        };

        yield* TestClock.setTime(new Date("2024-01-01T01:00:00.000Z").getTime());

        const cacheRepository = makeAniDbUnitCacheRepository(db, client);
        yield* cacheRepository.upsert({
          mediaId: 1,
          mediaUnits: [{ number: 1, title: "Cached Episode" }],
          updatedAt: "2024-01-01T00:30:00.000Z",
        });

        // All service usage stays inside Effect.provide so the scoped layer
        // (and its background refresh fiber) lives for the whole test.
        yield* Effect.gen(function* () {
          const service = yield* MediaMetadataEnrichmentService;

          yield* service.requestAniDbRefresh({
            mediaId: 1,
            unitCount: 12,
            title: { romaji: "Show" },
          });

          let attempts = 0;
          while ((yield* Ref.get(lookupCallsRef)) === 0 && attempts < 10_000) {
            yield* Effect.yieldNow;
            attempts += 1;
          }
          assert.deepStrictEqual(yield* Ref.get(lookupCallsRef), 1);

          const cacheState: MediaMetadataEnrichmentCacheState =
            yield* service.getAniDbCacheState(1);

          // The skip must not refresh freshness or wipe cached units.
          assert.deepStrictEqual(cacheState._tag, "Fresh");
          if (cacheState._tag === "Fresh") {
            assert.deepStrictEqual(cacheState.updatedAt, "2024-01-01T00:30:00.000Z");
            assert.deepStrictEqual(cacheState.mediaUnits, [{ number: 1, title: "Cached Episode" }]);
          }
        }).pipe(
          Effect.provide(
            makeEnrichmentLayer(db, client, AniDbClient.of({ getEpisodeMetadata: skippedLookup })),
          ),
        );

        const rows = yield* db.select().from(schema.anidbEpisodeCache).prepare().effect();
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.updatedAt, "2024-01-01T00:30:00.000Z");
      }),
    schema,
  }),
);
