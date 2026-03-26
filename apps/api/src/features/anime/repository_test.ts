import { assertEquals, it } from "../../test/vitest.ts";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit, Schema } from "effect";
import { ConfigCoreSchema } from "../system/config-schema.ts";

import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { anime, appConfig, episodes, systemLogs } from "../../db/schema.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import { encodeConfigCore } from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";

import {
  buildMissingEpisodeRows,
  ensureEpisodesEffect,
  findAnimeRootFolderOwnerEffect,
  getConfiguredImagesPathEffect,
  inferAiredAt,
  insertAnimeAggregateAtomicEffect,
  markSearchResultsAlreadyInLibraryEffect,
  resolveAnimeRootFolderEffect,
  upsertEpisodeEffect,
} from "./repository.ts";

it.scoped("upsertEpisode prevents duplicate anime episode rows", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* insertAnimeEffect(db, 1, 12);

      yield* upsertEpisodeEffect(db, 1, 1, {
        downloaded: true,
        filePath: "/library/Test Show/Test Show - 01.mkv",
        title: "Episode 1",
      });
      yield* upsertEpisodeEffect(db, 1, 1, {
        downloaded: false,
        title: "Episode 1 updated",
      });

      const rows = yield* Effect.promise(() =>
        db.select().from(episodes).where(eq(episodes.animeId, 1)),
      );
      assertEquals(rows.length, 1);
      assertEquals(rows[0]?.number, 1);
      assertEquals(rows[0]?.title, "Episode 1 updated");
    }),
  ),
);

it.scoped("ensureEpisodes rejects duplicate episode inserts for same anime", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* insertAnimeEffect(db, 2, 1);
      yield* Effect.promise(() =>
        db.insert(episodes).values({
          audioChannels: null,
          audioCodec: null,
          animeId: 2,
          durationSeconds: null,
          number: 1,
          fileSize: null,
          groupName: null,
          quality: null,
          resolution: null,
          title: null,
          aired: null,
          downloaded: false,
          filePath: null,
          videoCodec: null,
        }),
      );

      yield* ensureEpisodesEffect(
        db,
        2,
        1,
        "RELEASING",
        undefined,
        undefined,
        undefined,
        false,
        () => Effect.succeed("2024-01-01T00:00:00.000Z"),
      );

      const duplicateInsert = yield* Effect.exit(
        Effect.tryPromise(() =>
          db.insert(episodes).values({
            audioChannels: null,
            audioCodec: null,
            animeId: 2,
            durationSeconds: null,
            number: 1,
            fileSize: null,
            groupName: null,
            quality: null,
            resolution: null,
            title: null,
            aired: null,
            downloaded: false,
            filePath: null,
            videoCodec: null,
          }),
        ),
      );
      assertEquals(duplicateInsert._tag, "Failure");
    }),
  ),
);

it.scoped("insertAnimeAggregateAtomic rolls back anime inserts when a later write fails", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        insertAnimeAggregateAtomicEffect(db, {
          animeRow: {
            id: 77,
            malId: null,
            titleRomaji: "Rollback Show",
            titleEnglish: null,
            titleNative: null,
            format: "TV",
            description: null,
            score: null,
            genres: "[]",
            studios: "[]",
            coverImage: null,
            bannerImage: null,
            status: "RELEASING",
            episodeCount: 2,
            startDate: null,
            endDate: null,
            startYear: null,
            endYear: null,
            nextAiringAt: null,
            nextAiringEpisode: null,
            profileName: "Default",
            rootFolder: "/library/Rollback Show",
            addedAt: "2024-01-01T00:00:00.000Z",
            monitored: true,
            releaseProfileIds: "[]",
          },
          episodeRows: [
            {
              audioChannels: null,
              audioCodec: null,
              animeId: 77,
              durationSeconds: null,
              number: 1,
              fileSize: null,
              groupName: null,
              quality: null,
              resolution: null,
              title: null,
              aired: null,
              downloaded: false,
              filePath: null,
              videoCodec: null,
            },
            {
              audioChannels: null,
              audioCodec: null,
              animeId: 77,
              durationSeconds: null,
              number: 2,
              fileSize: null,
              groupName: null,
              quality: null,
              resolution: null,
              title: null,
              aired: null,
              downloaded: false,
              filePath: null,
              videoCodec: null,
            },
          ],
          log: {
            eventType: null as unknown as string,
            level: "success",
            message: "This should fail",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        }),
      );
      assertEquals(exit._tag, "Failure");

      const animeRows = yield* Effect.promise(() =>
        db.select().from(anime).where(eq(anime.id, 77)),
      );
      const episodeRows = yield* Effect.promise(() =>
        db.select().from(episodes).where(eq(episodes.animeId, 77)),
      );
      const logRows = yield* Effect.promise(() =>
        db.select().from(systemLogs).where(eq(systemLogs.message, "This should fail")),
      );

      assertEquals(animeRows.length, 0);
      assertEquals(episodeRows.length, 0);
      assertEquals(logRows.length, 0);
    }),
  ),
);

it("buildMissingEpisodeRows creates rows only for missing episodes", () => {
  const rows = buildMissingEpisodeRows({
    animeId: 15,
    episodeCount: 3,
    status: "RELEASING",
    startDate: undefined,
    endDate: undefined,
    futureAiringSchedule: undefined,
    resetMissingOnly: true,
    existingRows: [
      {
        audioChannels: null,
        audioCodec: null,
        id: 1,
        animeId: 15,
        durationSeconds: null,
        number: 1,
        fileSize: null,
        groupName: null,
        quality: null,
        resolution: null,
        title: null,
        aired: null,
        downloaded: true,
        filePath: "/library/Show 15/Show 15 - 01.mkv",
        videoCodec: null,
      },
    ],
  });

  assertEquals(rows.length, 2);
  assertEquals(
    rows.map((row) => row.number),
    [2, 3],
  );
});

it("inferAiredAt prefers AniList future schedule over heuristics", () => {
  const airedAt = inferAiredAt(
    "RELEASING",
    12,
    24,
    "2024-01-01",
    undefined,
    new Map([[12, "2024-03-20T12:00:00.000Z"]]),
  );

  assertEquals(airedAt, "2024-03-20T12:00:00.000Z");
});

it.scoped("resolveAnimeRootFolder can preserve an existing folder root", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      const rootFolder = yield* resolveAnimeRootFolderEffect(
        db,
        "/library/Naruto Fansub",
        "Naruto",
        { useExistingRoot: true },
      );

      assertEquals(rootFolder, "/library/Naruto Fansub");
    }),
  ),
);

it.scoped("anime repository helpers fail explicitly on corrupt stored config", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(appConfig).values({
          id: 1,
          data: "{not-json",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      );

      const rootFolderExit = yield* Effect.exit(resolveAnimeRootFolderEffect(db, "", "Naruto"));
      assertEquals(Exit.isFailure(rootFolderExit), true);
      if (Exit.isFailure(rootFolderExit)) {
        const failure = Cause.failureOption(rootFolderExit.cause);
        assertEquals(failure._tag, "Some");
        if (failure._tag === "Some") {
          assertEquals(failure.value._tag, "StoredConfigCorruptError");
        }
      }

      const imagesPathExit = yield* Effect.exit(getConfiguredImagesPathEffect(db));
      assertEquals(Exit.isFailure(imagesPathExit), true);
      if (Exit.isFailure(imagesPathExit)) {
        const failure = Cause.failureOption(imagesPathExit.cause);
        assertEquals(failure._tag, "Some");
        if (failure._tag === "Some") {
          assertEquals(failure.value._tag, "StoredConfigCorruptError");
        }
      }
    }),
  ),
);

it.scoped("anime repository helpers use stored config when available", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(appConfig).values({
          id: 1,
          data: (() => {
            const base = Schema.encodeSync(ConfigCoreSchema)(makeDefaultConfig("./test.sqlite"));
            return encodeConfigCore({
              ...base,
              downloads: { ...base.downloads, create_anime_folders: false },
              general: { ...base.general, images_path: "./custom-images" },
              library: { ...base.library, library_path: "/anime-library" },
            });
          })(),
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      );

      assertEquals(yield* resolveAnimeRootFolderEffect(db, "", "Naruto"), "/anime-library");
      assertEquals(yield* getConfiguredImagesPathEffect(db), "./custom-images");
    }),
  ),
);

it.scoped("markSearchResultsAlreadyInLibrary annotates local matches", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* insertAnimeEffect(db, 20, 12);

      const results = yield* markSearchResultsAlreadyInLibraryEffect(db, [
        {
          already_in_library: false,
          banner_image: undefined,
          cover_image: undefined,
          description: undefined,
          end_date: undefined,
          end_year: undefined,
          episode_count: 12,
          format: "TV",
          genres: undefined,
          id: 20,
          season: undefined,
          season_year: undefined,
          start_date: undefined,
          start_year: undefined,
          status: "RELEASING",
          title: { romaji: "Naruto" },
        },
        {
          already_in_library: false,
          banner_image: undefined,
          cover_image: undefined,
          description: undefined,
          end_date: undefined,
          end_year: undefined,
          episode_count: 24,
          format: "TV",
          genres: undefined,
          id: 21,
          season: undefined,
          season_year: undefined,
          start_date: undefined,
          start_year: undefined,
          status: "RELEASING",
          title: { romaji: "Bleach" },
        },
      ]);

      assertEquals(results[0]?.already_in_library, true);
      assertEquals(results[1]?.already_in_library, false);
    }),
  ),
);

it.scoped("findAnimeRootFolderOwner returns the mapped anime for a root", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* insertAnimeEffect(db, 20, 12);

      const owner = yield* findAnimeRootFolderOwnerEffect(db, "/library/Show-20");
      assertEquals(owner?.id, 20);
      assertEquals(owner?.titleRomaji, "Show 20");
    }),
  ),
);

it.scoped("findAnimeRootFolderOwner handles trailing slash parents", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* insertAnimeWithRootEffect(db, 21, 12, "/library/Naruto/");

      const owner = yield* findAnimeRootFolderOwnerEffect(db, "/library/Naruto/Season 1");

      assertEquals(owner?.id, 21);
    }),
  ),
);

it.scoped("anime root-folder triggers reject overlapping roots", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* insertAnimeWithRootEffect(db, 30, 12, "/library/Naruto/");

      const overlappingInsert = yield* Effect.exit(
        Effect.tryPromise(() => insertAnimeWithRoot(db, 31, 12, "/library/Naruto/Season 1")),
      );
      assertEquals(overlappingInsert._tag, "Failure");
    }),
  ),
);

const insertAnimeEffect = Effect.fn("AnimeRepositoryTest.insertAnimeEffect")(function* (
  db: AppDatabase,
  id: number,
  episodeCount: number,
) {
  yield* Effect.promise(() => insertAnimeWithRoot(db, id, episodeCount, `/library/Show-${id}`));
});

const insertAnimeWithRootEffect = Effect.fn("AnimeRepositoryTest.insertAnimeWithRootEffect")(
  function* (db: AppDatabase, id: number, episodeCount: number, rootFolder: string) {
    yield* Effect.promise(() => insertAnimeWithRoot(db, id, episodeCount, rootFolder));
  },
);

const withTestDbEffect = Effect.fn("AnimeRepositoryTest.withTestDbEffect")(function* <A, E, R>(
  run: (db: AppDatabase) => Effect.Effect<A, E, R>,
) {
  return yield* withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db) => run(db as AppDatabase),
    schema,
  });
});

async function insertAnimeWithRoot(
  db: AppDatabase,
  id: number,
  episodeCount: number,
  rootFolder: string,
) {
  await db.insert(anime).values({
    id,
    malId: null,
    titleRomaji: `Show ${id}`,
    titleEnglish: null,
    titleNative: null,
    format: "TV",
    description: null,
    score: null,
    genres: "[]",
    studios: "[]",
    coverImage: null,
    bannerImage: null,
    status: "RELEASING",
    episodeCount,
    startDate: null,
    endDate: null,
    startYear: null,
    endYear: null,
    nextAiringAt: null,
    nextAiringEpisode: null,
    profileName: "Default",
    rootFolder,
    addedAt: "2024-01-01T00:00:00.000Z",
    monitored: true,
    releaseProfileIds: "[]",
  });
}
