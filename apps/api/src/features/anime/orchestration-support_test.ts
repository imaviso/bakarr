import { assertEquals, it } from "@/test/vitest.ts";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit } from "effect";

import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { refreshEpisodesEffect } from "@/features/anime/orchestration-support.ts";

it.scoped(
  "refreshEpisodesEffect fails instead of silently using stored metadata when AniList fails",
  () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;

          yield* Effect.tryPromise(() =>
            appDb.insert(schema.anime).values({
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
            }),
          );

          const exit = yield* Effect.exit(
            refreshEpisodesEffect({
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
              db: appDb,
              eventPublisher: {
                publish: () => Effect.void,
                publishInfo: () => Effect.void,
              },
              nowIso: () => Effect.succeed("2024-01-01T00:00:00.000Z"),
            }),
          );

          const episodeRows = yield* Effect.tryPromise(() =>
            appDb.select().from(schema.episodes).where(eq(schema.episodes.animeId, 44)),
          );

          assertEquals(Exit.isFailure(exit), true);
          assertEquals(episodeRows.length, 0);
          if (Exit.isFailure(exit)) {
            const failure = Cause.failureOption(exit.cause);
            assertEquals(failure._tag, "Some");
            if (failure._tag === "Some") {
              assertEquals(failure.value._tag, "ExternalCallError");
            }
          }
        }),
      schema,
    }),
);
