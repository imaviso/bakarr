import { Cause, Effect, Exit } from "effect";

import * as schema from "@/db/schema.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { assert, it } from "@effect/vitest";
import { encodeNumberList } from "@/features/profiles/profile-codec.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { loadDownloadPresentationContexts } from "@/features/operations/repository/download-presentation-repository.ts";

it.scoped("download presentation contexts load imported paths", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile) =>
      Effect.gen(function* () {
        const releaseProfileIds = yield* encodeNumberList([]);

        yield* Effect.promise(() =>
          db.insert(media).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            bannerImage: null,
            coverImage: "https://example.com/naruto.jpg",
            description: null,
            endDate: null,
            endYear: null,
            unitCount: 12,
            format: "TV",
            genres: "[]",
            id: 20,
            malId: null,
            monitored: true,
            nextAiringAt: null,
            nextAiringUnit: null,
            profileName: "Default",
            releaseProfileIds,
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
          db.insert(mediaUnits).values({
            aired: null,
            mediaId: 20,
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
              mediaId: 20,
              mediaTitle: "Naruto",
              contentPath: "/downloads/Naruto - 01.mkv",
              coveredUnits: "[1]",
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 1,
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
        assert.deepStrictEqual(row !== undefined, true);
        if (!row) {
          return;
        }

        const contexts = yield* loadDownloadPresentationContexts(db, [row]);

        assert.deepStrictEqual(contexts.get(row.id), {
          mediaImage: "https://example.com/naruto.jpg",
          importedPath: "/library/Naruto/Naruto - 01.mkv",
        });
      }),
    schema,
  }),
);

it.scoped("download presentation contexts fail for corrupt covered episode metadata", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(media).values({
            addedAt: "2024-01-01T00:00:00.000Z",
            bannerImage: null,
            coverImage: "https://example.com/naruto.jpg",
            description: null,
            endDate: null,
            endYear: null,
            unitCount: 12,
            format: "TV",
            genres: "[]",
            id: 99,
            malId: null,
            monitored: true,
            nextAiringAt: null,
            nextAiringUnit: null,
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
            relatedMedia: null,
            recommendedMedia: null,
          }),
        );

        const [row] = yield* Effect.promise(() =>
          db
            .insert(schema.downloads)
            .values({
              addedAt: "2024-01-01T00:00:00.000Z",
              mediaId: 99,
              mediaTitle: "Naruto",
              contentPath: null,
              coveredUnits: "not-json",
              downloadDate: null,
              downloadedBytes: null,
              unitNumber: 1,
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
        assert.deepStrictEqual(row !== undefined, true);
        if (!row) {
          return;
        }

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
    schema,
  }),
);
