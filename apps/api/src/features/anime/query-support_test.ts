import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";
import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { withSqliteTestDb } from "../../test/database-test.ts";
import { runTestEffect } from "../../test/effect-test.ts";
import {
  withFileSystemSandbox,
  writeTextFile,
} from "../../test/filesystem-test.ts";
import {
  annotateAnimeSearchResultsForQuery,
  deriveEpisodeTimelineMetadata,
  getAnimeByAnilistIdEffect,
  getAnimeEffect,
  listAnimeEffect,
  listEpisodesEffect,
  searchAnimeEffect,
} from "./query-support.ts";

Deno.test("annotateAnimeSearchResultsForQuery adds confidence and reasons", () => {
  const results = annotateAnimeSearchResultsForQuery(
    "Naruto",
    [
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
    ] satisfies AnimeSearchResult[],
  );

  assertEquals(results[0]?.match_confidence, 1);
  assertEquals(results[0]?.match_reason, 'Exact title match for "Naruto"');
  assertEquals(results[1]?.match_confidence, 0.8);
  assertEquals(results[1]?.match_reason, 'Strong title match for "Naruto"');
});

Deno.test("annotateAnimeSearchResultsForQuery considers synonyms", () => {
  const results = annotateAnimeSearchResultsForQuery(
    "Boku no Hero Academia",
    [
      {
        id: 7,
        synonyms: ["My Hero Academia", "Boku no Hero Academia"],
        title: { english: "My Hero Academia", romaji: "Boku no Hero Academia" },
      },
    ] satisfies AnimeSearchResult[],
  );

  assertEquals(results[0]?.match_confidence, 1);
  assertEquals(
    results[0]?.match_reason,
    'Exact title match for "Boku no Hero Academia"',
  );
});

Deno.test("deriveEpisodeTimelineMetadata marks future and aired episodes", () => {
  assertEquals(
    deriveEpisodeTimelineMetadata(
      "2024-01-10T02:30:00.000Z",
      new Date("2024-01-09T12:00:00.000Z"),
    ),
    { airing_status: "future", is_future: true },
  );

  assertEquals(
    deriveEpisodeTimelineMetadata(
      "2024-01-08T02:30:00.000Z",
      new Date("2024-01-09T12:00:00.000Z"),
    ),
    { airing_status: "aired", is_future: false },
  );

  assertEquals(deriveEpisodeTimelineMetadata(undefined), {
    airing_status: "unknown",
  });
});

Deno.test("listEpisodesEffect fills missing media metadata from ffprobe", async () => {
  await withTestDb(async (db) => {
    await withFileSystemSandbox(async ({ root, fs }) => {
      const filePath = `${root}/Episode 1.mkv`;
      await runTestEffect(writeTextFile(fs, filePath, "test"));

      await db.insert(schema.anime).values({
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
      });
      await db.insert(schema.episodes).values({
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
        videoCodec: "HEVC",
        title: "Pilot",
      });

      const result = await Effect.runPromise(listEpisodesEffect({
        animeId: 1,
        db,
      }));

      assertEquals(result[0]?.resolution, "1080p");
      assertEquals(result[0]?.video_codec, "HEVC");
      assertEquals(result[0]?.audio_codec, "AAC");
      assertEquals(result[0]?.audio_channels, "2.0");
      assertEquals(result[0]?.duration_seconds, 1440);
      assertEquals(result[0]?.file_size, 4);
    });
  });
});

Deno.test("getAnimeByAnilistIdEffect returns related and recommended metadata", async () => {
  await withTestDb(async (db) => {
    const result = await Effect.runPromise(getAnimeByAnilistIdEffect({
      aniList: makeAniListStub({
        bannerImage: "https://example.com/banner.png",
        coverImage: "https://example.com/cover.png",
        format: "TV",
        id: 55,
        recommendedAnime: [{
          id: 77,
          title: { english: "Recommendation", romaji: "Recommendation" },
        }],
        relatedAnime: [{
          id: 56,
          relation_type: "SEQUEL",
          title: { english: "Sequel", romaji: "Sequel" },
        }],
        startDate: "2024-04-03",
        startYear: 2024,
        status: "RELEASING",
        synonyms: ["Stub Alias"],
        title: { english: "Stub Show", romaji: "Stub Show" },
      }),
      db,
      id: 55,
    }));

    assertEquals(result.related_anime?.[0]?.relation_type, "SEQUEL");
    assertEquals(
      result.recommended_anime?.[0]?.title.english,
      "Recommendation",
    );
    assertEquals(result.synonyms, ["Stub Alias"]);
  });
});

Deno.test("getAnimeEffect returns discovery metadata from database storage", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
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
    });
    await db.insert(schema.episodes).values({
      animeId: 80,
      downloaded: false,
      number: 1,
    });

    const result = await Effect.runPromise(getAnimeEffect({
      db,
      id: 80,
    }));

    assertEquals(result.related_anime?.[0]?.relation_type, "PREQUEL");
    assertEquals(
      result.recommended_anime?.[0]?.title.english,
      "Recommended Show",
    );
    assertEquals(result.synonyms, ["Alias One", "Alias Two"]);
  });
});

Deno.test("getAnimeEffect uses stored discovery metadata from database", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
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
    });
    await db.insert(schema.episodes).values({
      animeId: 90,
      downloaded: false,
      number: 1,
    });

    const result = await Effect.runPromise(getAnimeEffect({
      db,
      id: 90,
    }));

    assertEquals(result.id, 90);
    assertEquals(result.synonyms, ["Alt Title", "Another Name"]);
    assertEquals(result.related_anime?.length, 1);
    assertEquals(result.related_anime?.[0]?.id, 91);
    assertEquals(result.recommended_anime?.length, 1);
    assertEquals(result.recommended_anime?.[0]?.id, 92);
  });
});

Deno.test("searchAnimeEffect falls back to local matches when AniList search fails", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      episodeCount: 15,
      format: "TV",
      genres: '["Mystery", "Supernatural"]',
      id: 101,
      monitored: true,
      profileName: "Default",
      releaseProfileIds: "[]",
      rootFolder: "/library/Bakemonogatari",
      status: "FINISHED",
      studios: '["Shaft"]',
      titleEnglish: "Bakemonogatari",
      titleRomaji: "Bakemonogatari",
    });

    const result = await Effect.runPromise(searchAnimeEffect({
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
      db,
      query: "bake",
    }));

    assertEquals(result.degraded, true);
    assertEquals(result.results.length, 1);
    assertEquals(result.results[0]?.id, 101);
    assertEquals(result.results[0]?.already_in_library, true);
    assertEquals(
      result.results[0]?.match_reason,
      'Strong title match for "bake"',
    );
  });
});

Deno.test("searchAnimeEffect local fallback matches stored synonyms", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      episodeCount: 12,
      format: "TV",
      genres: "[]",
      id: 111,
      monitored: true,
      profileName: "Default",
      releaseProfileIds: "[]",
      rootFolder: "/library/Kizumonogatari",
      status: "FINISHED",
      studios: "[]",
      synonyms: '["Bake"]',
      titleEnglish: "Kizumonogatari",
      titleRomaji: "Kizumonogatari",
    });

    const result = await Effect.runPromise(searchAnimeEffect({
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
      db,
      query: "bake",
    }));

    assertEquals(result.degraded, true);
    assertEquals(result.results.length, 1);
    assertEquals(result.results[0]?.id, 111);
    assertEquals(result.results[0]?.synonyms, ["Bake"]);
  });
});

Deno.test("searchAnimeEffect returns empty list when AniList search fails and no local match", async () => {
  await withTestDb(async (db) => {
    const result = await Effect.runPromise(searchAnimeEffect({
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
      db,
      query: "bake",
    }));

    assertEquals(result.degraded, true);
    assertEquals(result.results, []);
  });
});

Deno.test("searchAnimeEffect reports non-degraded when AniList search succeeds", async () => {
  await withTestDb(async (db) => {
    const result = await Effect.runPromise(searchAnimeEffect({
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
      db,
      query: "bake",
    }));

    assertEquals(result.degraded, false);
    assertEquals(result.results.length, 1);
    assertEquals(result.results[0]?.id, 202);
  });
});

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

async function withTestDb(
  run: (db: AppDatabase) => Promise<void>,
): Promise<void> {
  await withSqliteTestDb({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) => run(db as AppDatabase),
    schema,
  });
}

Deno.test("listAnimeEffect returns paginated results with defaults", async () => {
  await withTestDb(async (db) => {
    for (let i = 1; i <= 5; i++) {
      await db.insert(schema.anime).values({
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
      });
    }

    const result = await Effect.runPromise(listAnimeEffect(db));

    assertEquals(result.total, 5);
    assertEquals(result.offset, 0);
    assertEquals(result.limit, 100);
    assertEquals(result.items.length, 5);
    assertEquals(result.has_more, false);
  });
});

Deno.test("listAnimeEffect respects limit and offset", async () => {
  await withTestDb(async (db) => {
    for (let i = 1; i <= 10; i++) {
      await db.insert(schema.anime).values({
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
      });
    }

    const page1 = await Effect.runPromise(
      listAnimeEffect(db, { limit: 3, offset: 0 }),
    );
    assertEquals(page1.items.length, 3);
    assertEquals(page1.items[0].id, 1);
    assertEquals(page1.has_more, true);
    assertEquals(page1.total, 10);

    const page2 = await Effect.runPromise(
      listAnimeEffect(db, { limit: 3, offset: 3 }),
    );
    assertEquals(page2.items.length, 3);
    assertEquals(page2.items[0].id, 4);
    assertEquals(page2.has_more, true);

    const page4 = await Effect.runPromise(
      listAnimeEffect(db, { limit: 3, offset: 9 }),
    );
    assertEquals(page4.items.length, 1);
    assertEquals(page4.items[0].id, 10);
    assertEquals(page4.has_more, false);
  });
});

Deno.test("listAnimeEffect caps limit at 500", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
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
    });

    const result = await Effect.runPromise(
      listAnimeEffect(db, { limit: 1000 }),
    );
    assertEquals(result.limit, 500);
  });
});

Deno.test("listAnimeEffect floors limit at 1", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
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
    });

    const result = await Effect.runPromise(listAnimeEffect(db, { limit: 0 }));
    assertEquals(result.limit, 1);
  });
});

Deno.test("listAnimeEffect floors negative offset at 0", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
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
    });

    const result = await Effect.runPromise(
      listAnimeEffect(db, { offset: -10 }),
    );
    assertEquals(result.offset, 0);
  });
});

Deno.test("listAnimeEffect aggregates episode download counts", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
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
    });

    await db.insert(schema.episodes).values([
      { animeId: 1, number: 1, downloaded: true, filePath: "/ep1.mkv" },
      { animeId: 1, number: 2, downloaded: true, filePath: "/ep2.mkv" },
      { animeId: 1, number: 3, downloaded: false, filePath: null },
    ]);

    const result = await Effect.runPromise(listAnimeEffect(db));
    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].progress.downloaded, 2);
  });
});

Deno.test("listAnimeEffect filters by monitored status", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values([
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
    ]);

    const allResults = await Effect.runPromise(listAnimeEffect(db));
    assertEquals(allResults.total, 2);
    assertEquals(allResults.items.length, 2);

    const monitoredOnly = await Effect.runPromise(
      listAnimeEffect(db, { monitored: true }),
    );
    assertEquals(monitoredOnly.total, 1);
    assertEquals(monitoredOnly.items[0].id, 1);

    const unmonitoredOnly = await Effect.runPromise(
      listAnimeEffect(db, { monitored: false }),
    );
    assertEquals(unmonitoredOnly.total, 1);
    assertEquals(unmonitoredOnly.items[0].id, 2);
  });
});

Deno.test("listAnimeEffect includes progress and metadata fields needed by list UI", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
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
    });

    await db.insert(schema.episodes).values([
      { animeId: 10, number: 1, downloaded: true, filePath: "/ep1.mkv" },
      { animeId: 10, number: 2, downloaded: false, filePath: null },
      { animeId: 10, number: 3, downloaded: false, filePath: null },
    ]);

    const result = await Effect.runPromise(listAnimeEffect(db));
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
  });
});
