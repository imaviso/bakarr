import { assertEquals, it } from "../../test/vitest.ts";
import { eq } from "drizzle-orm";
import { Effect, Exit } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";
import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import { MediaProbeMetadataFound } from "../../lib/media-probe.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "../../test/filesystem-test.ts";
import {
  annotateAnimeSearchResultsForQuery,
  deriveEpisodeTimelineMetadata,
  getAnimeByAnilistIdEffect,
  getAnimeEffect,
  listAnimeEffect,
  listEpisodesEffect,
  searchAnimeEffect,
} from "./query-support.ts";
import { listAnimeFilesEffect } from "./file-mapping-support.ts";

it("annotateAnimeSearchResultsForQuery adds confidence and reasons", () => {
  const results = annotateAnimeSearchResultsForQuery("Naruto", [
    {
      id: 1,
      title: { romaji: "Naruto" },
      format: "TV",
      status: "RELEASING",
    },
    {
      id: 2,
      synonyms: ["Naruto: Shippuuden"],
      title: { romaji: "Naruto Shippuden" },
      format: "TV",
      status: "FINISHED",
    },
  ] satisfies AnimeSearchResult[]);

  assertEquals(results[0]?.match_confidence, 1);
  assertEquals(results[0]?.match_reason, 'Exact title match for "Naruto"');
  assertEquals(results[1]?.match_confidence, 0.8);
  assertEquals(results[1]?.match_reason, 'Strong title match for "Naruto"');
});

it("annotateAnimeSearchResultsForQuery considers synonyms", () => {
  const results = annotateAnimeSearchResultsForQuery("Boku no Hero Academia", [
    {
      id: 7,
      synonyms: ["My Hero Academia", "Boku no Hero Academia"],
      title: { english: "My Hero Academia", romaji: "Boku no Hero Academia" },
    },
  ] satisfies AnimeSearchResult[]);

  assertEquals(results[0]?.match_confidence, 1);
  assertEquals(results[0]?.match_reason, 'Exact title match for "Boku no Hero Academia"');
});

it("deriveEpisodeTimelineMetadata marks future and aired episodes", () => {
  assertEquals(
    deriveEpisodeTimelineMetadata("2024-01-10T02:30:00.000Z", new Date("2024-01-09T12:00:00.000Z")),
    { airing_status: "future", is_future: true },
  );

  assertEquals(
    deriveEpisodeTimelineMetadata("2024-01-08T02:30:00.000Z", new Date("2024-01-09T12:00:00.000Z")),
    { airing_status: "aired", is_future: false },
  );

  assertEquals(deriveEpisodeTimelineMetadata(undefined), {
    airing_status: "unknown",
  });
});

it.scoped("listEpisodesEffect fills missing media metadata from ffprobe", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          const filePath = `${root}/Episode 1.mkv`;
          yield* writeTextFile(fs, filePath, "test");

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.anime).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              episodeCount: 1,
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
            appDb.insert(schema.episodes).values({
              aired: "2024-01-01T00:00:00.000Z",
              animeId: 1,
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
            animeId: 1,
            db: appDb,
          });

          assertEquals(result[0]?.resolution, "1080p");
          assertEquals(result[0]?.video_codec, "HEVC");
          assertEquals(result[0]?.audio_codec, "AAC");
          assertEquals(result[0]?.audio_channels, "2.0");
          assertEquals(result[0]?.duration_seconds, 1440);
          assertEquals(result[0]?.file_size, 4);
        }),
      ),
    schema,
  }),
);

it.scoped("listAnimeFilesEffect caches probed metadata to episode rows", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      withFileSystemSandboxEffect(({ root, fs }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          const filePath = `${root}/Episode 1.mkv`;
          yield* writeTextFile(fs, filePath, "test");

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.anime).values({
              addedAt: "2024-01-01T00:00:00.000Z",
              episodeCount: 1,
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
            appDb.insert(schema.episodes).values({
              aired: "2024-01-01T00:00:00.000Z",
              animeId: 101,
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
            animeId: 101,
            db: appDb,
            fs,
            mediaProbe,
          });

          const episodeRows = yield* Effect.tryPromise(() =>
            appDb.select().from(schema.episodes).where(eq(schema.episodes.animeId, 101)),
          );
          const row = episodeRows[0];

          assertEquals(first[0]?.resolution, "1080p");
          assertEquals(first[0]?.video_codec, "HEVC");
          assertEquals(first[0]?.audio_codec, "AAC");
          assertEquals(first[0]?.audio_channels, "2.0");
          assertEquals(first[0]?.duration_seconds, 1440);
          assertEquals(row?.resolution, "1080p");
          assertEquals(row?.videoCodec, "HEVC");
          assertEquals(row?.audioCodec, "AAC");
          assertEquals(row?.audioChannels, "2.0");
          assertEquals(row?.durationSeconds, 1440);

          const second = yield* listAnimeFilesEffect({
            animeId: 101,
            db: appDb,
            fs,
            mediaProbe,
          });

          assertEquals(second[0]?.resolution, "1080p");
          assertEquals(second[0]?.video_codec, "HEVC");
          assertEquals(second[0]?.audio_codec, "AAC");
          assertEquals(second[0]?.audio_channels, "2.0");
          assertEquals(second[0]?.duration_seconds, 1440);
          assertEquals(probeCalls, 1);
        }),
      ),
    schema,
  }),
);

it.scoped("getAnimeByAnilistIdEffect returns related and recommended metadata", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        const result = yield* getAnimeByAnilistIdEffect({
          aniList: makeAniListStub({
            bannerImage: "https://example.com/banner.png",
            coverImage: "https://example.com/cover.png",
            format: "TV",
            id: 55,
            recommendedAnime: [
              {
                id: 77,
                title: { english: "Recommendation", romaji: "Recommendation" },
              },
            ],
            relatedAnime: [
              {
                id: 56,
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

        assertEquals(result.related_anime?.[0]?.relation_type, "SEQUEL");
        assertEquals(result.recommended_anime?.[0]?.title.english, "Recommendation");
        assertEquals(result.synonyms, ["Stub Alias"]);
      }),
    schema,
  }),
);

it.scoped("getAnimeEffect returns discovery metadata from database storage", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            episodeCount: 1,
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
            relatedAnime:
              '[{"id":79,"relation_type":"PREQUEL","title":{"romaji":"Prequel Show"},"format":"TV","status":"FINISHED"}]',
            recommendedAnime:
              '[{"id":81,"title":{"english":"Recommended Show","romaji":"Recommended Show"},"format":"TV","status":"FINISHED"}]',
            titleRomaji: "Stub Show",
          }),
        );
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.episodes).values({
            animeId: 80,
            downloaded: false,
            number: 1,
          }),
        );

        const result = yield* getAnimeEffect({
          db: appDb,
          id: 80,
        });

        assertEquals(result.related_anime?.[0]?.relation_type, "PREQUEL");
        assertEquals(result.recommended_anime?.[0]?.title.english, "Recommended Show");
        assertEquals(result.synonyms, ["Alias One", "Alias Two"]);
      }),
    schema,
  }),
);

it.scoped("getAnimeEffect uses stored discovery metadata from database", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            episodeCount: 1,
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
            relatedAnime:
              '[{"id":91,"title":{"romaji":"Related Show"},"format":"TV","status":"FINISHED"}]',
            recommendedAnime:
              '[{"id":92,"title":{"romaji":"Recommended Show"},"format":"TV","status":"FINISHED"}]',
            titleRomaji: "Stored Show",
          }),
        );
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.episodes).values({
            animeId: 90,
            downloaded: false,
            number: 1,
          }),
        );

        const result = yield* getAnimeEffect({
          db: appDb,
          id: 90,
        });

        assertEquals(result.id, 90);
        assertEquals(result.synonyms, ["Alt Title", "Another Name"]);
        assertEquals(result.related_anime?.length, 1);
        assertEquals(result.related_anime?.[0]?.id, 91);
        assertEquals(result.recommended_anime?.length, 1);
        assertEquals(result.recommended_anime?.[0]?.id, 92);
      }),
    schema,
  }),
);

it.scoped("searchAnimeEffect fails when AniList search fails", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        const result = yield* Effect.exit(
          searchAnimeEffect({
            aniList: {
              getAnimeMetadataById: () => Effect.succeed(null),
              searchAnimeMetadata: () =>
                Effect.fail(
                  new ExternalCallError({
                    cause: new Error("rate limited"),
                    message: "AniList search failed",
                    operation: "anilist.search.response",
                  }),
                ),
            },
            db: appDb,
            query: "bake",
          }),
        );

        assertEquals(Exit.isFailure(result), true);
      }),
    schema,
  }),
);

it.scoped("searchAnimeEffect reports non-degraded when AniList search succeeds", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        const result = yield* searchAnimeEffect({
          aniList: {
            getAnimeMetadataById: () => Effect.succeed(null),
            searchAnimeMetadata: () =>
              Effect.succeed([
                {
                  already_in_library: false,
                  id: 202,
                  title: { romaji: "Bakemonogatari" },
                } satisfies AnimeSearchResult,
              ]),
          },
          db: appDb,
          query: "bake",
        });

        assertEquals(result.degraded, false);
        assertEquals(result.results.length, 1);
        assertEquals(result.results[0]?.id, 202);
      }),
    schema,
  }),
);

function makeAniListStub(metadata: {
  bannerImage?: string;
  coverImage?: string;
  description?: string;
  endDate?: string;
  endYear?: number;
  episodeCount?: number;
  format: string;
  genres?: string[];
  id: number;
  recommendedAnime?: Array<{
    id: number;
    relation_type?: string;
    title: { english?: string; romaji?: string; native?: string };
  }>;
  relatedAnime?: Array<{
    id: number;
    relation_type?: string;
    title: { english?: string; romaji?: string; native?: string };
  }>;
  startDate?: string;
  startYear?: number;
  status: string;
  synonyms?: string[];
  title: { english?: string; romaji: string; native?: string };
}) {
  return {
    getAnimeMetadataById: () => Effect.succeed(metadata),
    searchAnimeMetadata: () => Effect.succeed([]),
  };
}

it.scoped("listAnimeEffect returns paginated results with defaults", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        for (let i = 1; i <= 5; i++) {
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.anime).values({
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

        assertEquals(result.total, 5);
        assertEquals(result.offset, 0);
        assertEquals(result.limit, 100);
        assertEquals(result.items.length, 5);
        assertEquals(result.has_more, false);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect respects limit and offset", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        for (let i = 1; i <= 10; i++) {
          yield* Effect.tryPromise(() =>
            appDb.insert(schema.anime).values({
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
        assertEquals(page1.items.length, 3);
        assertEquals(page1.items[0].id, 1);
        assertEquals(page1.has_more, true);
        assertEquals(page1.total, 10);

        const page2 = yield* listAnimeEffect(appDb, { limit: 3, offset: 3 });
        assertEquals(page2.items.length, 3);
        assertEquals(page2.items[0].id, 4);
        assertEquals(page2.has_more, true);

        const page4 = yield* listAnimeEffect(appDb, { limit: 3, offset: 9 });
        assertEquals(page4.items.length, 1);
        assertEquals(page4.items[0].id, 10);
        assertEquals(page4.has_more, false);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect caps limit at 500", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
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
        assertEquals(result.limit, 500);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect floors limit at 1", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
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
        assertEquals(result.limit, 1);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect floors negative offset at 0", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
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
        assertEquals(result.offset, 0);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect aggregates episode download counts", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
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
            episodeCount: 3,
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.episodes).values([
            { animeId: 1, number: 1, downloaded: true, filePath: "/ep1.mkv" },
            { animeId: 1, number: 2, downloaded: true, filePath: "/ep2.mkv" },
            { animeId: 1, number: 3, downloaded: false, filePath: null },
          ]),
        );

        const result = yield* listAnimeEffect(appDb);
        assertEquals(result.items.length, 1);
        assertEquals(result.items[0].progress.downloaded, 2);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect filters by monitored status", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values([
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
        assertEquals(allResults.total, 2);
        assertEquals(allResults.items.length, 2);

        const monitoredOnly = yield* listAnimeEffect(appDb, { monitored: true });
        assertEquals(monitoredOnly.total, 1);
        assertEquals(monitoredOnly.items[0].id, 1);

        const unmonitoredOnly = yield* listAnimeEffect(appDb, { monitored: false });
        assertEquals(unmonitoredOnly.total, 1);
        assertEquals(unmonitoredOnly.items[0].id, 2);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect includes progress and metadata fields needed by list UI", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
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
            episodeCount: 3,
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(schema.episodes).values([
            { animeId: 10, number: 1, downloaded: true, filePath: "/ep1.mkv" },
            { animeId: 10, number: 2, downloaded: false, filePath: null },
            { animeId: 10, number: 3, downloaded: false, filePath: null },
          ]),
        );

        const result = yield* listAnimeEffect(appDb);
        assertEquals(result.items.length, 1);

        const anime = result.items[0];
        assertEquals(anime.progress.downloaded, 1);
        assertEquals(anime.progress.total, 3);
        assertEquals(anime.progress.downloaded_percent, 33);
        assertEquals(anime.progress.is_up_to_date, false);
        assertEquals(anime.progress.latest_downloaded_episode, 1);
        assertEquals(anime.progress.next_missing_episode, 2);
        assertEquals(anime.progress.missing, [2, 3]);
        assertEquals(anime.score, 87);
        assertEquals(anime.studios, ["Studio A"]);
        assertEquals(anime.release_profile_ids, [1, 2]);
        assertEquals(anime.genres, ["Action"]);
      }),
    schema,
  }),
);

it.scoped("listAnimeEffect fails when stored anime JSON metadata is corrupt", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) =>
      Effect.gen(function* () {
        const appDb = db as AppDatabase;
        yield* Effect.tryPromise(() =>
          appDb.insert(schema.anime).values({
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
        assertEquals(Exit.isFailure(result), true);
      }),
    schema,
  }),
);
