import { createClient } from "@libsql/client";
import { assertEquals } from "@std/assert";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Effect } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";
import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import {
  annotateAnimeSearchResultsForQuery,
  deriveEpisodeTimelineMetadata,
  getAnimeByAnilistIdEffect,
  getAnimeEffect,
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
    const root = await Deno.makeTempDir();
    const filePath = `${root}/Episode 1.mkv`;

    try {
      await Deno.writeTextFile(filePath, "test");

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
        filePath,
        number: 1,
        title: "Pilot",
      });

      const result = await Effect.runPromise(listEpisodesEffect({
        animeId: 1,
        db,
        fs: makeQuerySupportFs(),
        mediaProbe: {
          probeVideoFile: () =>
            Effect.succeed({
              audio_channels: "2.0",
              audio_codec: "AAC",
              duration_seconds: 1440,
              resolution: "1080p",
              video_codec: "HEVC",
            }),
        },
      }));

      assertEquals(result[0]?.resolution, "1080p");
      assertEquals(result[0]?.video_codec, "HEVC");
      assertEquals(result[0]?.audio_codec, "AAC");
      assertEquals(result[0]?.audio_channels, "2.0");
      assertEquals(result[0]?.duration_seconds, 1440);
      assertEquals(typeof result[0]?.file_size, "number");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
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

function makeQuerySupportFs(): FileSystemShape {
  const unsupported = () => Effect.die("unused file system method");

  return {
    copyFile: () => unsupported(),
    mkdir: () => unsupported(),
    openFile: () => unsupported(),
    readDir: () => unsupported(),
    readFile: () => unsupported(),
    realPath: () => unsupported(),
    remove: () => unsupported(),
    rename: () => unsupported(),
    stat: (path) =>
      Effect.tryPromise({
        try: () => Deno.stat(path),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "Failed to stat path",
            path: String(path),
          }),
      }),
    writeFile: () => unsupported(),
  };
}

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
  const databaseFile = await Deno.makeTempFile({ suffix: ".sqlite" });
  const client = createClient({ url: `file:${databaseFile}` });
  const db = drizzle({ client, schema });

  try {
    await migrate(db, { migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER });
    await run(db);
  } finally {
    client.close();
    await Deno.remove(databaseFile).catch(() => undefined);
  }
}
