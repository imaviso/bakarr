import type * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import * as TestClock from "effect/testing/TestClock";
import { Effect, Layer, Option, Ref } from "effect";
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
  buildAniDbMissTitleKey,
  type MediaMetadataEnrichmentCacheState,
} from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import { AniDbMissCacheRepository } from "@/features/media/units/anidb-miss-cache-repository.ts";
import type { AniDbMissCacheRecord } from "@/features/media/units/anidb-miss-cache-repository.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import {
  makeAniDbMissCacheRepository,
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
        Layer.succeed(AniDbMissCacheRepository, makeAniDbMissCacheRepository(db, client)),
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

it.effect("episode cache older than 6h reads stale", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(new Date("2024-01-01T08:00:00.000Z").getTime());

        const cacheRepository = makeAniDbUnitCacheRepository(db, client);
        yield* cacheRepository.upsert({
          mediaId: 1,
          mediaUnits: [{ number: 1, title: "Cached Episode" }],
          updatedAt: "2024-01-01T00:30:00.000Z",
        });

        yield* Effect.gen(function* () {
          const service = yield* MediaMetadataEnrichmentService;

          const cacheState: MediaMetadataEnrichmentCacheState =
            yield* service.getAniDbCacheState(1);
          assert.deepStrictEqual(cacheState, {
            _tag: "Stale",
            updatedAt: "2024-01-01T00:30:00.000Z",
          });
        }).pipe(
          Effect.provide(
            makeEnrichmentLayer(db, client, AniDbClient.of({ getEpisodeMetadata: staticMissLookup })),
          ),
        );
      }),
    schema,
  }),
);

it.effect("title_not_found is negatively cached and suppresses repeat lookups", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const lookupCallsRef = yield* Ref.make(0);
        const missLookup = (
          _input: AniDbEpisodeLookupInput,
        ): Effect.Effect<AniDbEpisodeLookupResult> => {
          const missed: AniDbEpisodeLookupResult = {
            _tag: "AniDbLookupSkipped",
            reason: "title_not_found",
          };
          return Ref.update(lookupCallsRef, (count) => count + 1).pipe(Effect.as(missed));
        };

        yield* TestClock.setTime(new Date("2024-01-01T01:00:00.000Z").getTime());

        const missRepository = makeAniDbMissCacheRepository(db, client);
        const request = {
          mediaId: 7,
          unitCount: 12,
          title: { romaji: "Unknown Show" },
        };

        yield* Effect.gen(function* () {
          const service = yield* MediaMetadataEnrichmentService;

          yield* service.requestAniDbRefresh(request);
          yield* waitForLookupCalls(lookupCallsRef, 1);

          const miss = yield* waitForMiss(missRepository, 7);
          assert.deepStrictEqual(miss?.updatedAt, "2024-01-01T01:00:00.000Z");

          // Second request inside the miss TTL must not burn UDP packets.
          // Deterministic without settling: suppression is decided
          // synchronously inside requestAniDbRefresh (DB load, no background
          // work), and the first run cannot increment the counter past this
          // point — its record write was already observed above.
          yield* service.requestAniDbRefresh(request);
          assert.deepStrictEqual(yield* Ref.get(lookupCallsRef), 1);
        }).pipe(
          Effect.provide(
            makeEnrichmentLayer(db, client, AniDbClient.of({ getEpisodeMetadata: missLookup })),
          ),
        );
      }),
    schema,
  }),
);

it.effect("corrected title re-arms the lookup despite a fresh miss", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const lookupCallsRef = yield* Ref.make(0);
        const missLookup = (
          _input: AniDbEpisodeLookupInput,
        ): Effect.Effect<AniDbEpisodeLookupResult> => {
          const missed: AniDbEpisodeLookupResult = {
            _tag: "AniDbLookupSkipped",
            reason: "title_not_found",
          };
          return Ref.update(lookupCallsRef, (count) => count + 1).pipe(Effect.as(missed));
        };

        yield* TestClock.setTime(new Date("2024-01-01T01:00:00.000Z").getTime());

        const missRepository = makeAniDbMissCacheRepository(db, client);

        yield* Effect.gen(function* () {
          const service = yield* MediaMetadataEnrichmentService;

          yield* service.requestAniDbRefresh({
            mediaId: 7,
            unitCount: 12,
            title: { romaji: "Wrong Title" },
          });
          yield* waitForLookupCalls(lookupCallsRef, 1);
          yield* waitForMiss(missRepository, 7);

          // Same media, corrected title: the fresh miss must not suppress it.
          // Re-request until observed — an early attempt may hit the queue
          // dedupe while the first run drains, which is also a correct
          // suppression (no duplicate UDP work).
          yield* requestUntilLookupCalls({
            expected: 2,
            lookupCallsRef,
            request: {
              mediaId: 7,
              unitCount: 12,
              title: { romaji: "Correct Title" },
            },
            service,
          });
        }).pipe(
          Effect.provide(
            makeEnrichmentLayer(db, client, AniDbClient.of({ getEpisodeMetadata: missLookup })),
          ),
        );
      }),
    schema,
  }),
);

it.effect("stale miss re-arms the lookup and refreshes the timestamp", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const lookupCallsRef = yield* Ref.make(0);
        const missLookup = (
          _input: AniDbEpisodeLookupInput,
        ): Effect.Effect<AniDbEpisodeLookupResult> => {
          const missed: AniDbEpisodeLookupResult = {
            _tag: "AniDbLookupSkipped",
            reason: "title_not_found",
          };
          return Ref.update(lookupCallsRef, (count) => count + 1).pipe(Effect.as(missed));
        };

        yield* TestClock.setTime(new Date("2024-01-01T01:00:00.000Z").getTime());

        const missRepository = makeAniDbMissCacheRepository(db, client);
        const staleRequest = {
          mediaId: 7,
          unitCount: 12,
          title: { romaji: "Unknown Show" },
        };
        // 25h old: past the 24h miss TTL.
        yield* missRepository.record({
          mediaId: 7,
          titleKey: buildAniDbMissTitleKey(staleRequest),
          updatedAt: "2023-12-31T00:00:00.000Z",
        });

        yield* Effect.gen(function* () {
          const service = yield* MediaMetadataEnrichmentService;

          yield* service.requestAniDbRefresh(staleRequest);
          yield* waitForLookupCalls(lookupCallsRef, 1);

          const miss = yield* waitForMiss(missRepository, 7);
          assert.deepStrictEqual(miss?.updatedAt, "2024-01-01T01:00:00.000Z");
        }).pipe(
          Effect.provide(
            makeEnrichmentLayer(db, client, AniDbClient.of({ getEpisodeMetadata: missLookup })),
          ),
        );
      }),
    schema,
  }),
);

it.effect("successful lookup clears the miss", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(new Date("2024-01-01T01:00:00.000Z").getTime());

        const missRepository = makeAniDbMissCacheRepository(db, client);
        const knownRequest = {
          mediaId: 7,
          unitCount: 12,
          title: { romaji: "Known Show" },
        };
        // Stale miss so the refresh is not suppressed; the success clears it.
        yield* missRepository.record({
          mediaId: 7,
          titleKey: buildAniDbMissTitleKey(knownRequest),
          updatedAt: "2023-12-31T00:00:00.000Z",
        });

        yield* Effect.gen(function* () {
          const service = yield* MediaMetadataEnrichmentService;

          yield* service.requestAniDbRefresh(knownRequest);

          let attempts = 0;
          while (attempts < 10_000) {
            const miss = yield* missRepository.load(7);
            if (Option.isNone(miss)) {
              break;
            }
            yield* Effect.yieldNow;
            attempts += 1;
          }

          const miss = yield* missRepository.load(7);
          assert.deepStrictEqual(Option.isNone(miss), true);

          const cacheState: MediaMetadataEnrichmentCacheState =
            yield* service.getAniDbCacheState(7);
          assert.deepStrictEqual(cacheState._tag, "Fresh");
        }).pipe(
          Effect.provide(
            makeEnrichmentLayer(db, client, AniDbClient.of({ getEpisodeMetadata: staticSuccessLookup })),
          ),
        );
      }),
    schema,
  }),
);

it.effect("config skips do not record a miss", () =>
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

        const missRepository = makeAniDbMissCacheRepository(db, client);

        yield* Effect.gen(function* () {
          const service = yield* MediaMetadataEnrichmentService;

          yield* service.requestAniDbRefresh({
            mediaId: 7,
            unitCount: 12,
            title: { romaji: "Show" },
          });
          yield* waitForLookupCalls(lookupCallsRef, 1);

          const miss = yield* missRepository.load(7);
          assert.deepStrictEqual(Option.isNone(miss), true);
        }).pipe(
          Effect.provide(
            makeEnrichmentLayer(db, client, AniDbClient.of({ getEpisodeMetadata: skippedLookup })),
          ),
        );
      }),
    schema,
  }),
);

const staticMissLookup = (
  _input: AniDbEpisodeLookupInput,
): Effect.Effect<AniDbEpisodeLookupResult> => {
  const missed: AniDbEpisodeLookupResult = {
    _tag: "AniDbLookupSkipped",
    reason: "title_not_found",
  };
  return Effect.succeed(missed);
};

const staticSuccessLookup = (
  _input: AniDbEpisodeLookupInput,
): Effect.Effect<AniDbEpisodeLookupResult> => {
  const found: AniDbEpisodeLookupResult = {
    _tag: "AniDbLookupSuccess",
    mediaUnits: [{ number: 1, title: "Episode 1" }],
  };
  return Effect.succeed(found);
};

const waitForLookupCalls = (lookupCallsRef: Ref.Ref<number>, expected: number) =>
  Effect.gen(function* () {
    let attempts = 0;
    while ((yield* Ref.get(lookupCallsRef)) < expected && attempts < 10_000) {
      yield* Effect.yieldNow;
      attempts += 1;
    }
    assert.deepStrictEqual(yield* Ref.get(lookupCallsRef), expected);
  });

const waitForMiss = (
  missRepository: typeof AniDbMissCacheRepository.Service,
  mediaId: number,
) =>
  Effect.gen(function* () {
    let found: AniDbMissCacheRecord | undefined;
    let attempts = 0;
    while (found === undefined && attempts < 10_000) {
      const miss = yield* missRepository.load(mediaId);
      if (Option.isSome(miss)) {
        found = miss.value;
      } else {
        yield* Effect.yieldNow;
        attempts += 1;
      }
    }
    assert.deepStrictEqual(found !== undefined, true);
    return found;
  });

const requestUntilLookupCalls = (input: {
  readonly expected: number;
  readonly lookupCallsRef: Ref.Ref<number>;
  readonly request: {
    readonly mediaId: number;
    readonly unitCount: number;
    readonly title: { readonly romaji: string };
  };
  readonly service: typeof MediaMetadataEnrichmentService.Service;
}) =>
  Effect.gen(function* () {
    let attempts = 0;
    while ((yield* Ref.get(input.lookupCallsRef)) < input.expected && attempts < 1_000) {
      yield* input.service.requestAniDbRefresh(input.request);
      yield* Effect.yieldNow;
      attempts += 1;
    }
    assert.deepStrictEqual(yield* Ref.get(input.lookupCallsRef), input.expected);
  });
