import assert from "node:assert/strict";
import { Cause, Effect, Exit } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { anime, episodes } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { it } from "@effect/vitest";
import { encodeNumberList } from "@/features/system/config-codec.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";

it.scoped("download presentation contexts load imported paths", () =>
  withTestDbEffect((db, _databaseFile) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(anime).values({
          addedAt: "2024-01-01T00:00:00.000Z",
          bannerImage: null,
          coverImage: "https://example.com/naruto.jpg",
          description: null,
          endDate: null,
          endYear: null,
          episodeCount: 12,
          format: "TV",
          genres: "[]",
          id: 20,
          malId: null,
          monitored: true,
          nextAiringAt: null,
          nextAiringEpisode: null,
          profileName: "Default",
          releaseProfileIds: encodeNumberList([]),
          rootFolder: "/library/Naruto",
          score: null,
          startDate: null,
          startYear: null,
          status: "RELEASING",
          studios: "[]",
          titleEnglish: "Naruto",
          titleNative: null,
          titleRomaji: "Naruto",
        }),
      );
      yield* Effect.promise(() =>
        db.insert(episodes).values({
          aired: null,
          animeId: 20,
          downloaded: true,
          filePath: "/library/Naruto/Naruto - 01.mkv",
          number: 1,
          title: null,
        }),
      );
      const [row] = yield* Effect.promise(() =>
        db
          .insert(schema.downloads)
          .values({
            addedAt: "2024-01-01T00:00:00.000Z",
            animeId: 20,
            animeTitle: "Naruto",
            contentPath: "/downloads/Naruto - 01.mkv",
            coveredEpisodes: "[1]",
            downloadDate: null,
            downloadedBytes: 0,
            episodeNumber: 1,
            errorMessage: null,
            etaSeconds: null,
            externalState: "imported",
            groupName: null,
            infoHash: null,
            isBatch: false,
            lastErrorAt: null,
            lastSyncedAt: null,
            magnet: null,
            progress: 100,
            reconciledAt: "2024-01-01T00:10:00.000Z",
            retryCount: 0,
            savePath: "/downloads",
            sourceMetadata: null,
            speedBytes: 0,
            status: "imported",
            torrentName: "Naruto - 01",
            totalBytes: 0,
          })
          .returning(),
      );

      const contexts = yield* loadDownloadPresentationContexts(db, [row]);

      assert.deepStrictEqual(contexts.get(row.id), {
        animeImage: "https://example.com/naruto.jpg",
        importedPath: "/library/Naruto/Naruto - 01.mkv",
      });
    }),
  ),
);

it.scoped("download presentation contexts fail for corrupt covered episode metadata", () =>
  withTestDbEffect((db, _databaseFile) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(anime).values({
          addedAt: "2024-01-01T00:00:00.000Z",
          bannerImage: null,
          coverImage: "https://example.com/naruto.jpg",
          description: null,
          endDate: null,
          endYear: null,
          episodeCount: 12,
          format: "TV",
          genres: "[]",
          id: 99,
          malId: null,
          monitored: true,
          nextAiringAt: null,
          nextAiringEpisode: null,
          profileName: "Default",
          releaseProfileIds: "[]",
          rootFolder: "/library/Naruto",
          score: null,
          startDate: null,
          startYear: null,
          status: "FINISHED",
          studios: "[]",
          synonyms: null,
          titleEnglish: null,
          titleNative: null,
          titleRomaji: "Naruto",
          relatedAnime: null,
          recommendedAnime: null,
        }),
      );

      const [row] = yield* Effect.promise(() =>
        db
          .insert(schema.downloads)
          .values({
            addedAt: "2024-01-01T00:00:00.000Z",
            animeId: 99,
            animeTitle: "Naruto",
            contentPath: null,
            coveredEpisodes: "not-json",
            downloadDate: null,
            downloadedBytes: null,
            episodeNumber: 1,
            errorMessage: null,
            etaSeconds: null,
            externalState: null,
            groupName: null,
            infoHash: null,
            isBatch: true,
            lastErrorAt: null,
            lastSyncedAt: null,
            magnet: null,
            progress: 0,
            reconciledAt: null,
            retryCount: 0,
            savePath: "/downloads",
            sourceMetadata: null,
            speedBytes: 0,
            status: "queued",
            torrentName: "Naruto - Batch",
            totalBytes: 0,
          })
          .returning(),
      );

      const exit = yield* Effect.exit(loadDownloadPresentationContexts(db, [row]));

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof OperationsStoredDataError, true);
        }
      }
    }),
  ),
);

const withTestDbEffect = Effect.fn("DownloadPresentationRepositoryTest.withTestDbEffect")(
  function* <A, E, R>(run: (db: AppDatabase, databaseFile: string) => Effect.Effect<A, E, R>) {
    return yield* withSqliteTestDbEffect({
      run: (db, databaseFile) => run(db as AppDatabase, databaseFile),
      schema,
    });
  },
);
