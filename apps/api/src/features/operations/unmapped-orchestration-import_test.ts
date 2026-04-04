import { eq } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { dirname } from "node:path";

import { anime, appConfig, episodes } from "@/db/schema.ts";
import { encodeConfigCore } from "@/features/system/config-codec.ts";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import { makeUnmappedImportWorkflow } from "@/features/operations/unmapped-orchestration-import.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { assert, it } from "@effect/vitest";
import { makeTestFileSystemEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { withSqliteRawClientEffect, withSqliteTestDbEffect } from "@/test/database-test.ts";
import * as schema from "@/db/schema.ts";

it.scoped("unmapped import rolls back when a later insert fails", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        const fs = yield* makeTestFileSystemEffect();
        const libraryRoot = dirname(databaseFile);
        const appDb = db;
        const baseConfig = Schema.encodeSync(ConfigCoreSchema)(makeDefaultConfig(databaseFile));

        yield* Effect.tryPromise(() =>
          appDb.insert(appConfig).values({
            id: 1,
            data: Effect.runSync(
              encodeConfigCore({
                ...baseConfig,
                library: {
                  ...baseConfig.library,
                  library_path: libraryRoot,
                },
              }),
            ),
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(anime).values(
            makeAnimeRow({
              id: 20,
              profileName: "Default",
              rootFolder: "/library/Old Show",
              titleRomaji: "Old Show",
            }),
          ),
        );

        const importRoot = `${libraryRoot}/incoming`;
        yield* fs.mkdir(importRoot, { recursive: true });
        yield* writeTextFile(fs, `${importRoot}/Show - 001.mkv`, "episode 1");
        yield* writeTextFile(fs, `${importRoot}/Show - 002.mkv`, "episode 2");

        yield* withSqliteRawClientEffect({
          databaseFile,
          run: (client) =>
            client.unsafe(
              "create trigger episode_insert_abort before insert on episodes when (select count(*) from episodes where anime_id = new.anime_id) >= 1 begin select raise(fail, 'boom'); end;",
            ).withoutTransform,
        });

        const workflow = makeUnmappedImportWorkflow({
          db: appDb,
          fs,
          nowIso: () => Effect.succeed("2024-01-01T00:00:00.000Z"),
          tryDatabasePromise,
        });

        const exit = yield* Effect.exit(
          workflow.importUnmappedFolder({
            anime_id: 20,
            folder_name: "incoming",
            profile_name: "Imported",
          }),
        );

        assert.deepStrictEqual(exit._tag, "Failure");

        const [animeRow] = yield* Effect.tryPromise(() =>
          appDb.select().from(anime).where(eq(anime.id, 20)).limit(1),
        );
        assert.deepStrictEqual(animeRow.profileName, "Default");
        assert.deepStrictEqual(animeRow.rootFolder, "/library/Old Show");

        const episodeRows = yield* Effect.tryPromise(() =>
          appDb.select().from(episodes).where(eq(episodes.animeId, 20)),
        );
        assert.deepStrictEqual(episodeRows.length, 0);
      }),
    schema,
  }),
);

function makeAnimeRow(overrides: Partial<typeof anime.$inferSelect>): typeof anime.$inferSelect {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    bannerImage: null,
    coverImage: null,
    description: null,
    endDate: null,
    endYear: null,
    episodeCount: 12,
    format: "TV",
    genres: "[]",
    id: 1,
    malId: null,
    monitored: true,
    nextAiringAt: null,
    nextAiringEpisode: null,
    profileName: "Default",
    recommendedAnime: null,
    releaseProfileIds: "[]",
    relatedAnime: null,
    rootFolder: "/library/Anime",
    score: null,
    startDate: null,
    startYear: null,
    status: "RELEASING",
    studios: "[]",
    synonyms: null,
    titleEnglish: null,
    titleNative: null,
    titleRomaji: "Anime",
    ...overrides,
  };
}
