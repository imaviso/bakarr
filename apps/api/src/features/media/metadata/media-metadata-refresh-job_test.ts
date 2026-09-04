import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { media, backgroundJobs, systemLogs } from "@/db/schema.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import { refreshMetadataForMonitoredMediaEffect } from "@/features/media/metadata/media-metadata-refresh-job.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { tryDatabaseQuery } from "@/infra/effect/db.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { Effect } from "effect";
import {
  makeBackgroundJobRepository,
  makeMediaRepository,
  makeMediaUnitRepository,
  makeSystemLogRepository,
} from "@/test/repository-factories.ts";

it.effect(
  "refreshMetadataForMonitoredMediaEffect skips per-media external failures and completes",
  () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, _exec) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;

          yield* insertAnimeRow(appDb, 801);
          yield* insertAnimeRow(appDb, 802);

          const result = yield* refreshMetadataForMonitoredMediaEffect({
            imageCacheService: MediaImageCacheService.of({
              cacheMetadataImages: () => Effect.succeed({}),
            }),
            metadataProvider: MediaMetadataProviderService.of({
              getAnimeMetadataById: (id: number) =>
                id === 801
                  ? Effect.fail(
                      ExternalCallError.make({
                        cause: new Error("jikan unavailable"),
                        message: "Jikan unavailable",
                        operation: "jikan.detail.full",
                      }),
                    )
                  : Effect.succeed({
                      _tag: "Found",
                      enrichment: {
                        _tag: "Degraded",
                        reason: { _tag: "AniDbNoEpisodeMetadata" },
                      },
                      metadata: makeMetadata(id),
                    }),
              getSeasonalAnime: () => Effect.die(new Error("not used in test")),
              searchMedia: () => Effect.die(new Error("not used in test")),
            }),
            backgroundJobRepository: makeBackgroundJobRepository(appDb, client),
            mediaRepository: makeMediaRepository(appDb, client),
            mediaUnitRepository: makeMediaUnitRepository(appDb, client),
            systemLogRepository: makeSystemLogRepository(appDb, client),
            nowIso: () => Effect.succeed("2026-04-16T00:00:00.000Z"),
            refreshConcurrency: 2,
          });

          const [jobRow] = yield* tryDatabaseQuery(
            "Failed to query backgroundJobs for refresh assertion",
            appDb
              .select()
              .from(backgroundJobs)
              .where(eq(backgroundJobs.name, "metadata_refresh"))
              .prepare()
              .effect(),
          );
          const allLogs = yield* tryDatabaseQuery(
            "Failed to query systemLogs for refresh assertion",
            appDb.select().from(systemLogs).prepare().effect(),
          );

          assert.deepStrictEqual(result.refreshed, 1);
          assert.deepStrictEqual(jobRow?.lastStatus, "success");
          assert.deepStrictEqual(
            jobRow?.lastMessage,
            "Refreshed 1 monitored media (1 skipped due to errors)",
          );
          assert.deepStrictEqual(
            allLogs.some((entry) => entry.eventType === "system.task.metadata_refresh.failed"),
            false,
          );
        }),
      schema,
    }),
);

it.effect(
  "refreshMetadataForMonitoredMediaEffect preserves ExternalCallError type for top-level failures",
  () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, _exec) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;

          const nowIsoError = ExternalCallError.make({
            cause: new Error("clock unavailable"),
            message: "clock unavailable",
            operation: "system.now_iso",
          });
          const nowIso: () => Effect.Effect<string, ExternalCallError> = (() => {
            let nowIsoCalls = 0;

            return () =>
              Effect.sync(() => {
                nowIsoCalls += 1;
                return nowIsoCalls;
              }).pipe(
                Effect.flatMap((callCount) =>
                  callCount === 3
                    ? Effect.fail(nowIsoError)
                    : Effect.succeed(`2026-04-16T00:00:0${callCount}.000Z`),
                ),
              );
          })();

          const result = yield* refreshMetadataForMonitoredMediaEffect({
            imageCacheService: MediaImageCacheService.of({
              cacheMetadataImages: () => Effect.succeed({}),
            }),
            metadataProvider: MediaMetadataProviderService.of({
              getAnimeMetadataById: () =>
                Effect.succeed({
                  _tag: "NotFound",
                }),
              getSeasonalAnime: () => Effect.die(new Error("not used in test")),
              searchMedia: () => Effect.die(new Error("not used in test")),
            }),
            backgroundJobRepository: makeBackgroundJobRepository(appDb, client),
            mediaRepository: makeMediaRepository(appDb, client),
            mediaUnitRepository: makeMediaUnitRepository(appDb, client),
            systemLogRepository: makeSystemLogRepository(appDb, client),
            nowIso,
            refreshConcurrency: 1,
          }).pipe(Effect.result);

          const [jobRow] = yield* tryDatabaseQuery(
            "Failed to query backgroundJobs for top-level failure assertion",
            appDb
              .select()
              .from(backgroundJobs)
              .where(eq(backgroundJobs.name, "metadata_refresh"))
              .prepare()
              .effect(),
          );

          assert.deepStrictEqual(result._tag, "Failure");
          if (result._tag === "Failure") {
            const left = result.failure;
            assert.deepStrictEqual(left instanceof ExternalCallError, true);
            if (left instanceof ExternalCallError) {
              assert.deepStrictEqual(left.operation, "system.now_iso");
            }
          }
          assert.deepStrictEqual(jobRow?.lastStatus, "failed");
          assert.deepStrictEqual(jobRow?.lastMessage, "ExternalCallError: clock unavailable");
        }),
      schema,
    }),
);

const insertAnimeRow = Effect.fn("Test.insertAnimeRow")(function* (db: AppDatabase, id: number) {
  yield* tryDatabaseQuery(
    "Failed to insert test anime row for refresh job",
    db
      .insert(media)
      .values({
        id,
        titleRomaji: `Media ${id}`,
        format: "TV",
        status: "RELEASING",
        genres: "[]",
        studios: "[]",
        profileName: "Default",
        rootFolder: `/library/media-${id}`,
        addedAt: "2026-04-10T00:00:00.000Z",
        releaseProfileIds: "[]",
        monitored: true,
        bannerImage: null,
        coverImage: null,
      })
      .prepare()
      .effect(),
  );
});

function makeMetadata(id: number): AnimeMetadata {
  return {
    id,
    format: "TV",
    status: "RELEASING",
    title: { romaji: `Media ${id} Updated` },
    genres: [],
    studios: [],
    recommendedMedia: [],
    relatedMedia: [],
    synonyms: [],
  };
}
