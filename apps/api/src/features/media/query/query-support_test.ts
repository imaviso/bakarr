import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit, Option } from "effect";

import { brandMediaId, type MediaSearchResult } from "@packages/shared/index.ts";
import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { deriveEpisodeTimelineMetadata } from "@/domain/media/derivations.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { MediaProbeMetadataFound } from "@/infra/media/probe.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { MediaStoredDataError } from "@/features/media/errors.ts";
import { listAnimeEffect } from "@/features/media/query/media-query-list.ts";
import { getAnimeEffect } from "@/features/media/query/media-query-get.ts";
import {
  searchAnimeEffect,
  getAnimeByAnilistIdEffect,
} from "@/features/media/query/media-query-search.ts";
import { listEpisodesEffect } from "@/features/media/query/media-query-units.ts";
import { annotateAnimeSearchResultsForQuery } from "@/features/media/query/media-search-annotation.ts";
import { listAnimeFilesEffect } from "@/features/media/files/media-file-list.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";

it("annotateAnimeSearchResultsForQuery adds confidence and reasons", () => {
  const results = annotateAnimeSearchResultsForQuery("Naruto", [
    {
      id: brandMediaId(1),
      title: { romaji: "Naruto" },
      format: "TV",
      status: "RELEASING",
    },
    {
      id: brandMediaId(2),
      synonyms: ["Naruto: Shippuuden"],
      title: { romaji: "Naruto Shippuden" },
      format: "TV",
      status: "FINISHED",
    },
  ] satisfies MediaSearchResult[]);

  assert.deepStrictEqual(results[0]?.match_confidence, 1);
  assert.deepStrictEqual(results[0]?.match_reason, 'Exact title match for "Naruto"');
  assert.deepStrictEqual(results[1]?.match_confidence, 0.8);
  assert.deepStrictEqual(results[1]?.match_reason, 'Strong title match for "Naruto"');
});

it("annotateAnimeSearchResultsForQuery considers synonyms", () => {
  const results = annotateAnimeSearchResultsForQuery("Boku no Hero Academia", [
    {
      id: brandMediaId(7),
      synonyms: ["My Hero Academia", "Boku no Hero Academia"],
      title: { english: "My Hero Academia", romaji: "Boku no Hero Academia" },
    },
  ] satisfies MediaSearchResult[]);

  assert.deepStrictEqual(results[0]?.match_confidence, 1);
  assert.deepStrictEqual(results[0]?.match_reason, 'Exact title match for "Boku no Hero Academia"');
});

it("deriveEpisodeTimelineMetadata marks future and aired mediaUnits", () => {
  assert.deepStrictEqual(
    deriveEpisodeTimelineMetadata("2024-01-10T02:30:00.000Z", new Date("2024-01-09T12:00:00.000Z")),
    { airing_status: "future", is_future: true },
  );

  assert.deepStrictEqual(
    deriveEpisodeTimelineMetadata("2024-01-08T02:30:00.000Z", new Date("2024-01-09T12:00:00.000Z")),
    { airing_status: "aired", is_future: false },
  );

  assert.deepStrictEqual(deriveEpisodeTimelineMetadata(undefined), {
    airing_status: "unknown",
    is_future: undefined,
  });
});

it.scoped("listEpisodesEffect fills missing media metadata from ffprobe", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/MediaUnit 1.mkv`;
          yield* writeTextFile(fs, filePath, "test");

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              unitCount: 1,
              format: "TV",
              genres: "[]",
              id: 1,
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: root,
              status: "RELEASING",
              studios: "[]",
              titleRomaji: "Test Show",
            }),
          );
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              aired: "2024-01-01T00:00:00.000Z",
              mediaId: 1,
              downloaded: true,
              durationSeconds: 1440,
              filePath,
              fileSize: 4,
              audioChannels: "2.0",
              audioCodec: "AAC",
              number: 1,
              resolution: "1080p",
              title: "Pilot",
              videoCodec: "HEVC",
            }),
          );

          const result = yield* listEpisodesEffect({
            mediaId: 1,
            db: appDb,
            now: new Date("2024-01-02T00:00:00.000Z"),
          });

          assert.deepStrictEqual(result[0]?.resolution, "1080p");
          assert.deepStrictEqual(result[0]?.video_codec, "HEVC");
          assert.deepStrictEqual(result[0]?.audio_codec, "AAC");
          assert.deepStrictEqual(result[0]?.audio_channels, "2.0");
          assert.deepStrictEqual(result[0]?.duration_seconds, 1440);
          assert.deepStrictEqual(result[0]?.file_size, 4);
        }),
      ),
    schema,
  }),
);

it.scoped("listAnimeFilesEffect caches probed metadata to episode rows", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const appDb: AppDatabase = db;
          const filePath = `${root}/MediaUnit 1.mkv`;
          yield* writeTextFile(fs, filePath, "test");

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              unitCount: 1,
              format: "TV",
              genres: "[]",
              id: 101,
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: root,
              status: "RELEASING",
              studios: "[]",
              titleRomaji: "Probe Cache Show",
            }),
          );

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.mediaUnits).values({
              aired: "2024-01-01T00:00:00.000Z",
              mediaId: 101,
              downloaded: true,
              filePath,
              fileSize: 4,
              number: 1,
              title: "Pilot",
            }),
          );

          let probeCalls = 0;
          const mediaProbe = {
            probeVideoFile: (_path: string) => {
              probeCalls += 1;
              return Effect.succeed(
                new MediaProbeMetadataFound({
                  metadata: {
                    audio_channels: "2.0",
                    audio_codec: "AAC",
                    duration_seconds: 1440,
                    resolution: "1080p",
                    video_codec: "HEVC",
                  },
                }),
              );
            },
          };

          const first = yield* listAnimeFilesEffect({
            mediaId: 101,
            db: appDb,
            fs,
            mediaProbe,
          });

          const episodeRows = yield* Effect.tryPromise(() =>
            appDb.select().from(schema.mediaUnits).where(eq(schema.mediaUnits.mediaId, 101)),
          );
          const [row] = episodeRows;

          assert.deepStrictEqual(first[0]?.resolution, "1080p");
          assert.deepStrictEqual(first[0]?.video_codec, "HEVC");
          assert.deepStrictEqual(first[0]?.audio_codec, "AAC");
          assert.deepStrictEqual(first[0]?.audio_channels, "2.0");
          assert.deepStrictEqual(first[0]?.duration_seconds, 1440);
          assert.deepStrictEqual(row?.resolution, "1080p");
          assert.deepStrictEqual(row?.videoCodec, "HEVC");
          assert.deepStrictEqual(row?.audioCodec, "AAC");
          assert.deepStrictEqual(row?.audioChannels, "2.0");
          assert.deepStrictEqual(row?.durationSeconds, 1440);

          const second = yield* listAnimeFilesEffect({
            mediaId: 101,
            db: appDb,
            fs,
            mediaProbe,
          });

          assert.deepStrictEqual(second[0]?.resolution, "1080p");
          assert.deepStrictEqual(second[0]?.video_codec, "HEVC");
          assert.deepStrictEqual(second[0]?.audio_codec, "AAC");
          assert.deepStrictEqual(second[0]?.audio_channels, "2.0");
          assert.deepStrictEqual(second[0]?.duration_seconds, 1440);
          assert.deepStrictEqual(probeCalls, 1);
        }),
      ),
    schema,
  }),
);

it.scoped("getAnimeByAnilistIdEffect returns related and recommended metadata", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const result = yield* getAnimeByAnilistIdEffect({
          aniList: makeAniListStub({
            bannerImage: "https://example.com/banner.png",
            coverImage: "https://example.com/cover.png",
            format: "TV",
            id: brandMediaId(55),
            recommendedMedia: [
              {
                id: brandMediaId(77),
                title: { english: "Recommendation", romaji: "Recommendation" },
              },
            ],
            relatedMedia: [
              {
                id: brandMediaId(56),
                relation_type: "SEQUEL",
                title: { english: "Sequel", romaji: "Sequel" },
              },
            ],
            startDate: "2024-04-03",
            startYear: 2024,
            status: "RELEASING",
            synonyms: ["Stub Alias"],
            title: { english: "Stub Show", romaji: "Stub Show" },
          }),
          db: appDb,
          id: 55,
        });

        assert.deepStrictEqual(result.related_media?.[0]?.relation_type, "SEQUEL");
        assert.deepStrictEqual(result.recommended_media?.[0]?.title.english, "Recommendation");
        assert.deepStrictEqual(result.synonyms, ["Stub Alias"]);
      }),
    schema,
  }),
);

it.scoped("getAnimeEffect returns discovery metadata from database storage", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            unitCount: 1,
            format: "TV",
            genres: "[]",
            id: 80,
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            rootFolder: "/library/Stub",
            status: "RELEASING",
            studios: "[]",
            synonyms: '["Alias One", "Alias Two"]',
            relatedMedia:
              '[{"id":79,"relation_type":"PREQUEL","title":{"romaji":"Prequel Show"},"format":"TV","status":"FINISHED"}]',
            recommendedMedia:
              '[{"id":81,"title":{"english":"Recommended Show","romaji":"Recommended Show"},"format":"TV","status":"FINISHED"}]',
            titleRomaji: "Stub Show",
          }),
        );
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.mediaUnits).values({
            mediaId: 80,
            downloaded: false,
            number: 1,
          }),
        );

        const result = yield* getAnimeEffect({
          db: appDb,
          id: 80,
        });

        assert.deepStrictEqual(result.related_media?.[0]?.relation_type, "PREQUEL");
        assert.deepStrictEqual(result.recommended_media?.[0]?.title.english, "Recommended Show");
        assert.deepStrictEqual(result.synonyms, ["Alias One", "Alias Two"]);
      }),
    schema,
  }),
);

it.scoped("getAnimeEffect uses stored discovery metadata from database", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            unitCount: 1,
            format: "TV",
            genres: "[]",
            id: 90,
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            rootFolder: "/library/StoredMetadata",
            status: "RELEASING",
            studios: "[]",
            synonyms: '["Alt Title", "Another Name"]',
            relatedMedia:
              '[{"id":91,"title":{"romaji":"Related Show"},"format":"TV","status":"FINISHED"}]',
            recommendedMedia:
              '[{"id":92,"title":{"romaji":"Recommended Show"},"format":"TV","status":"FINISHED"}]',
            titleRomaji: "Stored Show",
          }),
        );
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.mediaUnits).values({
            mediaId: 90,
            downloaded: false,
            number: 1,
          }),
        );

        const result = yield* getAnimeEffect({
          db: appDb,
          id: 90,
        });

        assert.deepStrictEqual(result.id, 90);
        assert.deepStrictEqual(result.synonyms, ["Alt Title", "Another Name"]);
        assert.deepStrictEqual(result.related_media?.length, 1);
        assert.deepStrictEqual(result.related_media?.[0]?.id, 91);
        assert.deepStrictEqual(result.recommended_media?.length, 1);
        assert.deepStrictEqual(result.recommended_media?.[0]?.id, 92);
      }),
    schema,
  }),
);

it.scoped("searchAnimeEffect fails when AniList search fails", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const result = yield* Effect.exit(
          searchAnimeEffect({
            aniList: {
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              searchAnimeMetadata: () =>
                Effect.fail(
                  new ExternalCallError({
                    cause: new Error("rate limited"),
                    message: "AniList search failed",
                    operation: "anilist.search.response",
                  }),
                ),
              getSeasonalAnime: () => Effect.succeed([]),
            },
            db: appDb,
            query: "bake",
          }),
        );

        assert.deepStrictEqual(Exit.isFailure(result), true);
        if (Exit.isFailure(result)) {
          const failure = Cause.failureOption(result.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value instanceof ExternalCallError, true);
            assert.deepStrictEqual(failure.value.message, "AniList search failed");
          }
        }
      }),
    schema,
  }),
);

it.scoped("searchAnimeEffect reports non-degraded when AniList search succeeds", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const result = yield* searchAnimeEffect({
          aniList: {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            searchAnimeMetadata: () =>
              Effect.succeed([
                {
                  already_in_library: false,
                  id: brandMediaId(202),
                  title: { romaji: "Bakemonogatari" },
                } satisfies MediaSearchResult,
              ]),
            getSeasonalAnime: () => Effect.succeed([]),
          },
          db: appDb,
          query: "bake",
        });

        assert.deepStrictEqual(result.degraded, false);
        assert.deepStrictEqual(result.results.length, 1);
        assert.deepStrictEqual(result.results[0]?.id, 202);
      }),
    schema,
  }),
);

it.scoped("searchAnimeEffect falls back to Manami when AniList returns no results", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const result = yield* searchAnimeEffect({
          aniList: {
            getAnimeMetadataById: () => Effect.succeed(Option.none()),
            searchAnimeMetadata: () => Effect.succeed([]),
            getSeasonalAnime: () => Effect.succeed([]),
          },
          db: appDb,
          manami: {
            searchAnime: () =>
              Effect.succeed([
                {
                  already_in_library: false,
                  id: brandMediaId(20),
                  title: { english: "Naruto", romaji: "NARUTO" },
                } satisfies MediaSearchResult,
              ]),
          },
          query: "Naruto",
        });

        assert.deepStrictEqual(result.degraded, true);
        assert.deepStrictEqual(result.results.length, 1);
        assert.deepStrictEqual(result.results[0]?.id, 20);
        assert.deepStrictEqual(result.results[0]?.match_confidence, 1);
      }),
    schema,
  }),
);

function makeAniListStub(metadata: AnimeMetadata) {
  return {
    getAnimeMetadataById: () => Effect.succeed(Option.some(metadata)),
    searchAnimeMetadata: () => Effect.succeed([]),
    getSeasonalAnime: () => Effect.succeed([]),
  };
}

it.scoped("listAnimeEffect returns paginated results with defaults", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        for (let i = 1; i <= 5; i++) {
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              id: i,
              titleRomaji: `Show ${i}`,
              rootFolder: `/test/${i}`,
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: true,
            }),
          );
        }

        const result = yield* listAnimeEffect(appDb);

        assert.deepStrictEqual(result.total, 5);
        assert.deepStrictEqual(result.offset, 0);
        assert.deepStrictEqual(result.limit, 100);
        assert.deepStrictEqual(result.items.length, 5);
        assert.deepStrictEqual(result.has_more, false);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect respects limit and offset", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        for (let i = 1; i <= 10; i++) {
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.media).values({
              id: i,
              titleRomaji: `Show ${i}`,
              rootFolder: `/test/${i}`,
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: true,
            }),
          );
        }

        const page1 = yield* listAnimeEffect(appDb, { limit: 3, offset: 0 });
        const page1First = page1.items[0];
        assert(page1First);
        assert.deepStrictEqual(page1.items.length, 3);
        assert.deepStrictEqual(page1First.id, 1);
        assert.deepStrictEqual(page1.has_more, true);
        assert.deepStrictEqual(page1.total, 10);

        const page2 = yield* listAnimeEffect(appDb, { limit: 3, offset: 3 });
        const page2First = page2.items[0];
        assert(page2First);
        assert.deepStrictEqual(page2.items.length, 3);
        assert.deepStrictEqual(page2First.id, 4);
        assert.deepStrictEqual(page2.has_more, true);

        const page4 = yield* listAnimeEffect(appDb, { limit: 3, offset: 9 });
        const page4First = page4.items[0];
        assert(page4First);
        assert.deepStrictEqual(page4.items.length, 1);
        assert.deepStrictEqual(page4First.id, 10);
        assert.deepStrictEqual(page4.has_more, false);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect caps limit at 500", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
          }),
        );

        const result = yield* listAnimeEffect(appDb, { limit: 1000 });
        assert.deepStrictEqual(result.limit, 500);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect floors limit at 1", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
          }),
        );

        const result = yield* listAnimeEffect(appDb, { limit: 0 });
        assert.deepStrictEqual(result.limit, 1);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect floors negative offset at 0", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
          }),
        );

        const result = yield* listAnimeEffect(appDb, { offset: -10 });
        assert.deepStrictEqual(result.offset, 0);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect aggregates episode download counts", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 1,
            titleRomaji: "Show",
            rootFolder: "/test",
            format: "TV",
            status: "FINISHED",
            genres: "[]",
            studios: "[]",
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
            unitCount: 3,
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.mediaUnits).values([
            { mediaId: 1, number: 1, downloaded: true, filePath: "/ep1.mkv" },
            { mediaId: 1, number: 2, downloaded: true, filePath: "/ep2.mkv" },
            { mediaId: 1, number: 3, downloaded: false, filePath: null },
          ]),
        );

        const result = yield* listAnimeEffect(appDb);
        const firstItem = result.items[0];
        assert(firstItem);
        assert.deepStrictEqual(result.items.length, 1);
        assert.deepStrictEqual(firstItem.progress.downloaded, 2);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect filters by monitored status", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values([
            {
              id: 1,
              titleRomaji: "Monitored Show",
              rootFolder: "/test/1",
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: true,
            },
            {
              id: 2,
              titleRomaji: "Unmonitored Show",
              rootFolder: "/test/2",
              format: "TV",
              status: "FINISHED",
              genres: "[]",
              studios: "[]",
              profileName: "Default",
              releaseProfileIds: "[]",
              addedAt: "2024-01-01T00:00:00Z",
              monitored: false,
            },
          ]),
        );

        const allResults = yield* listAnimeEffect(appDb);
        assert.deepStrictEqual(allResults.total, 2);
        assert.deepStrictEqual(allResults.items.length, 2);

        const monitoredOnly = yield* listAnimeEffect(appDb, { monitored: true });
        const monitoredFirst = monitoredOnly.items[0];
        assert(monitoredFirst);
        assert.deepStrictEqual(monitoredOnly.total, 1);
        assert.deepStrictEqual(monitoredFirst.id, 1);

        const unmonitoredOnly = yield* listAnimeEffect(appDb, { monitored: false });
        const unmonitoredFirst = unmonitoredOnly.items[0];
        assert(unmonitoredFirst);
        assert.deepStrictEqual(unmonitoredOnly.total, 1);
        assert.deepStrictEqual(unmonitoredFirst.id, 2);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect includes progress and metadata fields needed by list UI", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 10,
            titleRomaji: "Detailed Show",
            rootFolder: "/test/10",
            format: "TV",
            status: "RELEASING",
            genres: '["Action"]',
            studios: '["Studio A"]',
            score: 87,
            profileName: "Default",
            releaseProfileIds: "[1,2]",
            addedAt: "2024-01-01T00:00:00Z",
            monitored: true,
            unitCount: 3,
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.mediaUnits).values([
            { mediaId: 10, number: 1, downloaded: true, filePath: "/ep1.mkv" },
            { mediaId: 10, number: 2, downloaded: false, filePath: null },
            { mediaId: 10, number: 3, downloaded: false, filePath: null },
          ]),
        );

        const result = yield* listAnimeEffect(appDb);
        assert.deepStrictEqual(result.items.length, 1);

        const media = result.items[0];
        assert(media);
        assert.deepStrictEqual(media.progress.downloaded, 1);
        assert.deepStrictEqual(media.progress.total, 3);
        assert.deepStrictEqual(media.progress.downloaded_percent, 33);
        assert.deepStrictEqual(media.progress.is_up_to_date, false);
        assert.deepStrictEqual(media.progress.latest_downloaded_unit, 1);
        assert.deepStrictEqual(media.progress.next_missing_unit, 2);
        assert.deepStrictEqual(media.progress.missing, [2, 3]);
        assert.deepStrictEqual(media.score, 87);
        assert.deepStrictEqual(media.studios, ["Studio A"]);
        assert.deepStrictEqual(media.release_profile_ids, [1, 2]);
        assert.deepStrictEqual(media.genres, ["Action"]);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect fails when stored media JSON metadata is corrupt", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.media).values({
            id: 10,
            titleRomaji: "Broken Show",
            rootFolder: "/test/10",
            format: "TV",
            status: "RELEASING",
            genres: "not-json",
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            addedAt: "2024-01-01T00:00:00Z",
            studios: "[]",
          }),
        );

        const result = yield* Effect.exit(listAnimeEffect(appDb));
        assert.deepStrictEqual(Exit.isFailure(result), true);
        if (Exit.isFailure(result)) {
          const failure = Cause.failureOption(result.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value instanceof MediaStoredDataError, true);
            assert.match(failure.value.message, /genres/i);
          }
        }
      }),
    schema,
  }),
);
