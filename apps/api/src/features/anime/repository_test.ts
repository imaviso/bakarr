import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit, Schema } from "effect";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";

import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, appConfig, episodes, qualityProfiles, systemLogs } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { encodeConfigCore } from "@/features/system/config-codec.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import { qualityProfileExistsEffect } from "@/features/anime/profile-support.ts";

import {
  buildMissingEpisodeRows,
  ensureEpisodesEffect,
} from "@/features/anime/anime-schedule-repository.ts";
import { upsertEpisodeEffect } from "@/features/anime/anime-episode-repository.ts";
import { findAnimeRootFolderOwnerEffect } from "@/features/anime/anime-read-repository.ts";
import { inferAiredAt } from "@/lib/anime-derivations.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/lib/anime-search-results.ts";
import {
  getConfiguredImagesPathEffect,
  getConfiguredLibraryPathEffect,
  resolveAnimeRootFolderEffect,
} from "@/features/anime/config-support.ts";
import { insertAnimeAggregateAtomicEffect } from "@/features/anime/aggregate-support.ts";

it.scoped("upsertEpisode prevents duplicate anime episode rows", () =>
  withSqliteTestDbEffect({
    run: (db) =>
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
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.number, 1);
        assert.deepStrictEqual(rows[0]?.title, "Episode 1 updated");
      }),
    schema,
  }),
);

it.scoped("ensureEpisodes rejects duplicate episode inserts for same anime", () =>
  withSqliteTestDbEffect({
    run: (db) =>
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
        assert.deepStrictEqual(duplicateInsert._tag, "Failure");
      }),
    schema,
  }),
);

it.scoped("insertAnimeAggregateAtomic rolls back anime inserts when a later write fails", () =>
  withSqliteTestDbEffect({
    run: (db) =>
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
            ],
            log: {
              eventType: "anime.created",
              level: "success",
              message: "This should fail",
              createdAt: "2024-01-01T00:00:00.000Z",
            },
          }),
        );
        assert.deepStrictEqual(exit._tag, "Failure");

        const animeRows = yield* Effect.promise(() =>
          db.select().from(anime).where(eq(anime.id, 77)),
        );
        const episodeRows = yield* Effect.promise(() =>
          db.select().from(episodes).where(eq(episodes.animeId, 77)),
        );
        const logRows = yield* Effect.promise(() =>
          db.select().from(systemLogs).where(eq(systemLogs.message, "This should fail")),
        );

        assert.deepStrictEqual(animeRows.length, 0);
        assert.deepStrictEqual(episodeRows.length, 0);
        assert.deepStrictEqual(logRows.length, 0);
      }),
    schema,
  }),
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

  assert.deepStrictEqual(rows.length, 2);
  assert.deepStrictEqual(
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

  assert.deepStrictEqual(airedAt, "2024-03-20T12:00:00.000Z");
});

it.scoped("resolveAnimeRootFolder can preserve an existing folder root", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const rootFolder = yield* resolveAnimeRootFolderEffect(
          db,
          "/library/Naruto Fansub",
          "Naruto",
          { useExistingRoot: true },
        );

        assert.deepStrictEqual(rootFolder, "/library/Naruto Fansub");
      }),
    schema,
  }),
);

it.scoped("anime repository helpers fail explicitly on corrupt stored config", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(appConfig).values({
            id: 1,
            data: "{not-json",
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        const rootFolderExit = yield* Effect.exit(resolveAnimeRootFolderEffect(db, "", "Naruto"));
        assert.deepStrictEqual(Exit.isFailure(rootFolderExit), true);
        if (Exit.isFailure(rootFolderExit)) {
          const failure = Cause.failureOption(rootFolderExit.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value._tag, "AnimeStoredDataError");
          }
        }

        const imagesPathExit = yield* Effect.exit(getConfiguredImagesPathEffect(db));
        assert.deepStrictEqual(Exit.isFailure(imagesPathExit), true);
        if (Exit.isFailure(imagesPathExit)) {
          const failure = Cause.failureOption(imagesPathExit.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value._tag, "AnimeStoredDataError");
          }
        }
      }),
    schema,
  }),
);

it.scoped("anime repository helpers use stored config when available", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(appConfig).values({
            id: 1,
            data: (() => {
              const base = Schema.encodeSync(ConfigCoreSchema)(makeDefaultConfig("./test.sqlite"));
              return Effect.runSync(
                encodeConfigCore({
                  ...base,
                  downloads: { ...base.downloads, create_anime_folders: false },
                  general: { ...base.general, images_path: "./custom-images" },
                  library: { ...base.library, library_path: "/anime-library" },
                }),
              );
            })(),
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );

        assert.deepStrictEqual(
          yield* resolveAnimeRootFolderEffect(db, "", "Naruto"),
          "/anime-library",
        );
        assert.deepStrictEqual(yield* getConfiguredImagesPathEffect(db), "./custom-images");
        assert.deepStrictEqual(yield* getConfiguredLibraryPathEffect(db), "/anime-library");
      }),
    schema,
  }),
);

it.scoped("qualityProfileExistsEffect checks stored quality profile rows", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        assert.deepStrictEqual(yield* qualityProfileExistsEffect(db, "Standard"), false);

        yield* Effect.promise(() =>
          db.insert(qualityProfiles).values({
            allowedQualities: "1080p",
            cutoff: "720p",
            maxSize: null,
            minSize: null,
            name: "Standard",
            seadexPreferred: false,
            upgradeAllowed: true,
          }),
        );

        assert.deepStrictEqual(yield* qualityProfileExistsEffect(db, "Standard"), true);
      }),
    schema,
  }),
);

it.scoped("markSearchResultsAlreadyInLibrary annotates local matches", () =>
  withSqliteTestDbEffect({
    run: (db) =>
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

        assert.deepStrictEqual(results[0]?.already_in_library, true);
        assert.deepStrictEqual(results[1]?.already_in_library, false);
      }),
    schema,
  }),
);

it.scoped("findAnimeRootFolderOwner returns the mapped anime for a root", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* insertAnimeEffect(db, 20, 12);

        const owner = yield* findAnimeRootFolderOwnerEffect(db, "/library/Show-20");
        assert.deepStrictEqual(owner?.id, 20);
        assert.deepStrictEqual(owner?.titleRomaji, "Show 20");
      }),
    schema,
  }),
);

it.scoped("findAnimeRootFolderOwner handles trailing slash parents", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* insertAnimeWithRootEffect(db, 21, 12, "/library/Naruto/");

        const owner = yield* findAnimeRootFolderOwnerEffect(db, "/library/Naruto/Season 1");

        assert.deepStrictEqual(owner?.id, 21);
      }),
    schema,
  }),
);

it.scoped("anime root-folder triggers reject overlapping roots", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* insertAnimeWithRootEffect(db, 30, 12, "/library/Naruto/");

        const overlappingInsert = yield* Effect.exit(
          Effect.tryPromise(() => insertAnimeWithRoot(db, 31, 12, "/library/Naruto/Season 1")),
        );
        assert.deepStrictEqual(overlappingInsert._tag, "Failure");
      }),
    schema,
  }),
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
