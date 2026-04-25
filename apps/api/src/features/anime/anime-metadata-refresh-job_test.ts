import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { anime, backgroundJobs, systemLogs } from "@/db/schema.ts";
import type { AnimeMetadata } from "@/features/anime/anilist-model.ts";
import { refreshMetadataForMonitoredAnimeEffect } from "@/features/anime/anime-metadata-refresh-job.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped(
  "refreshMetadataForMonitoredAnimeEffect skips per-anime external failures and completes",
  () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;

          yield* insertAnimeRow(appDb, 801);
          yield* insertAnimeRow(appDb, 802);

          const result = yield* refreshMetadataForMonitoredAnimeEffect({
            imageCacheService: {
              cacheMetadataImages: () => Effect.succeed({}),
            },
            metadataProvider: {
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
            },
            db: appDb,
            nowIso: () => Effect.succeed("2026-04-16T00:00:00.000Z"),
            refreshConcurrency: 2,
          });

          const [jobRow] = yield* Effect.promise(() =>
            appDb.select().from(backgroundJobs).where(eq(backgroundJobs.name, "metadata_refresh")),
          );
          const allLogs = yield* Effect.promise(() => appDb.select().from(systemLogs));

          assert.deepStrictEqual(result.refreshed, 1);
          assert.deepStrictEqual(jobRow?.lastStatus, "success");
          assert.deepStrictEqual(
            jobRow?.lastMessage,
            "Refreshed 1 monitored anime (1 skipped due external failures)",
          );
          assert.deepStrictEqual(
            allLogs.some((entry) => entry.eventType === "system.task.metadata_refresh.failed"),
            false,
          );
        }),
      schema,
    }),
);

it.scoped(
  "refreshMetadataForMonitoredAnimeEffect preserves ExternalCallError type for top-level failures",
  () =>
    withSqliteTestDbEffect({
      run: (db) =>
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

          const result = yield* refreshMetadataForMonitoredAnimeEffect({
            imageCacheService: {
              cacheMetadataImages: () => Effect.succeed({}),
            },
            metadataProvider: {
              getAnimeMetadataById: () =>
                Effect.succeed({
                  _tag: "NotFound",
                }),
            },
            db: appDb,
            nowIso,
            refreshConcurrency: 1,
          }).pipe(Effect.either);

          const [jobRow] = yield* Effect.promise(() =>
            appDb.select().from(backgroundJobs).where(eq(backgroundJobs.name, "metadata_refresh")),
          );

          assert.deepStrictEqual(result._tag, "Left");
          if (result._tag === "Left") {
            const left = result.left as unknown;
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
  yield* Effect.promise(() =>
    db.insert(anime).values({
      id,
      titleRomaji: `Anime ${id}`,
      format: "TV",
      status: "RELEASING",
      genres: "[]",
      studios: "[]",
      profileName: "Default",
      rootFolder: `/library/anime-${id}`,
      addedAt: "2026-04-10T00:00:00.000Z",
      releaseProfileIds: "[]",
      monitored: true,
      bannerImage: null,
      coverImage: null,
    }),
  );
});

function makeMetadata(id: number): AnimeMetadata {
  return {
    id,
    format: "TV",
    status: "RELEASING",
    title: { romaji: `Anime ${id} Updated` },
    genres: [],
    studios: [],
    recommendedAnime: [],
    relatedAnime: [],
    synonyms: [],
  };
}
