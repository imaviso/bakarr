import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { dirname } from "node:path";

import { media, appConfig, mediaUnits } from "@/db/schema.ts";
import { encodeConfigCore, toConfigCore } from "@/features/system/config-codec.ts";
import { makeUnmappedImportWorkflow } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { assert, it } from "@effect/vitest";
import { makeTestFileSystemEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { withSqliteRawClientEffect, withSqliteTestDbEffect } from "@/test/database-test.ts";
import * as schema from "@/db/schema.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";

it.scoped("unmapped import rolls back when a later insert fails", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        const fs = yield* makeTestFileSystemEffect();
        const libraryRoot = dirname(databaseFile);
        const appDb = db;
        const testConfig = makeTestConfig(databaseFile, (config) => ({
          ...config,
          library: {
            ...config.library,
            library_path: libraryRoot,
          },
        }));
        const encodedConfig = yield* encodeConfigCore(yield* toConfigCore(testConfig));

        yield* Effect.tryPromise(() =>
          appDb.insert(appConfig).values({
            id: 1,
            data: encodedConfig,
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        yield* Effect.tryPromise(() =>
          appDb.insert(media).values(
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
              "create trigger episode_insert_abort before insert on media_units when (select count(*) from media_units where media_id = new.media_id) >= 1 begin select raise(fail, 'boom'); end;",
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
            media_id: 20,
            folder_name: "incoming",
            profile_name: "Imported",
          }),
        );

        assert.deepStrictEqual(exit._tag, "Failure");

        const [animeRow] = yield* Effect.tryPromise(() =>
          appDb.select().from(media).where(eq(media.id, 20)).limit(1),
        );
        assert.deepStrictEqual(animeRow !== undefined, true);
        if (!animeRow) {
          return;
        }
        assert.deepStrictEqual(animeRow.profileName, "Default");
        assert.deepStrictEqual(animeRow.rootFolder, "/library/Old Show");

        const episodeRows = yield* Effect.tryPromise(() =>
          appDb.select().from(mediaUnits).where(eq(mediaUnits.mediaId, 20)),
        );
        assert.deepStrictEqual(episodeRows.length, 0);
      }),
    schema,
  }),
);

function makeAnimeRow(overrides: Partial<typeof media.$inferSelect>): typeof media.$inferSelect {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    background: null,
    bannerImage: null,
    coverImage: null,
    description: null,
    duration: null,
    endDate: null,
    endYear: null,
    unitCount: 12,
    favorites: null,
    format: "TV",
    genres: "[]",
    id: 1,
    mediaKind: "anime",
    malId: null,
    members: null,
    monitored: true,
    nextAiringAt: null,
    nextAiringUnit: null,
    popularity: null,
    profileName: "Default",
    recommendedMedia: null,
    releaseProfileIds: "[]",
    relatedMedia: null,
    rootFolder: "/library/Media",
    rank: null,
    rating: null,
    score: null,
    source: null,
    startDate: null,
    startYear: null,
    status: "RELEASING",
    studios: "[]",
    synonyms: null,
    titleEnglish: null,
    titleNative: null,
    titleRomaji: "Media",
    ...overrides,
  };
}
