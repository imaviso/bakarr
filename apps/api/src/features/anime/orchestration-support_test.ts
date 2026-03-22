import { assertEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { withSqliteTestDb } from "../../test/database-test.ts";
import { refreshEpisodesEffect } from "./orchestration-support.ts";

Deno.test("refreshEpisodesEffect falls back to stored metadata when AniList fails", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.anime).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      bannerImage: null,
      coverImage: null,
      description: null,
      endDate: null,
      endYear: null,
      episodeCount: 3,
      format: "TV",
      genres: "[]",
      id: 44,
      malId: null,
      monitored: true,
      nextAiringAt: null,
      nextAiringEpisode: null,
      profileName: "Default",
      recommendedAnime: null,
      releaseProfileIds: "[]",
      relatedAnime: null,
      rootFolder: "/library/Fallback Show",
      score: null,
      startDate: "2024-01-01",
      startYear: 2024,
      status: "RELEASING",
      studios: "[]",
      synonyms: null,
      titleEnglish: "Fallback Show",
      titleNative: null,
      titleRomaji: "Fallback Show",
    });

    await Effect.runPromise(refreshEpisodesEffect({
      aniList: {
        getAnimeMetadataById: () =>
          Effect.fail(
            new ExternalCallError({
              cause: new Error("AniList unavailable"),
              message: "AniList detail failed",
              operation: "anilist.detail.response",
            }),
          ),
        searchAnimeMetadata: () => Effect.succeed([]),
      },
      animeId: 44,
      db,
      eventPublisher: {
        publish: () => Effect.void,
        publishInfo: () => Effect.void,
      },
    }));

    const episodeRows = await db.select().from(schema.episodes).where(
      eq(schema.episodes.animeId, 44),
    );

    assertEquals(episodeRows.length, 3);
    assertEquals(episodeRows.map((row) => row.number), [1, 2, 3]);
  });
});

async function withTestDb(run: (db: AppDatabase) => Promise<void>) {
  await withSqliteTestDb({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) => run(db as AppDatabase),
    schema,
  });
}
