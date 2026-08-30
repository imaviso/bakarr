import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect, Layer, Schema, Stream } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { media, qualityProfiles } from "@/db/schema.ts";
import { AddMediaInput } from "@/features/media/add/add-media-input.ts";
import { MediaEnrollmentService } from "@/features/media/add/media-enrollment-service.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredSynonymsEffect,
} from "@/features/media/shared/decode-support.ts";
import { FileSystemError, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  makeMediaRepository,
  makeMediaUnitRepository,
  makeQualityProfileRepository,
  makeSystemConfigRepository,
} from "@/test/repository-factories.ts";

it.scoped("MediaEnrollmentService.enroll persists MAL backfill and mapped relation metadata", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const mediaId = 601;

        yield* insertQualityProfileEffect(appDb, "Default");

        const metadata: AnimeMetadata = {
          ...makeMetadata(mediaId),
          malId: 123456,
          recommendedMedia: [
            { id: brandMediaId(9201), title: { romaji: "Recommendation from mapped relation" } },
          ],
          relatedMedia: [
            { id: brandMediaId(9101), title: { romaji: "Mapped relation sequel" } },
            { id: brandMediaId(9102), title: { romaji: "Mapped relation side story" } },
          ],
          synonyms: ["Mapped Alias", "Another Alias"],
        };

        const events: Array<{ type: string; message?: string }> = [];
        const animeInput = yield* Schema.decodeUnknown(AddMediaInput)({
          id: mediaId,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: "/library/My Added Show",
          use_existing_root: true,
        });

        const layer = makeEnrollmentLayer(appDb, {
          metadataProvider: MediaMetadataProviderService.make({
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata,
              }),
            getSeasonalAnime: () => Effect.dieMessage("not used in test"),
            searchMedia: () => Effect.dieMessage("not used in test"),
          }),
          imageCacheService: MediaImageCacheService.make({
            cacheMetadataImages: () =>
              Effect.succeed({
                bannerImage: "/api/images/media/601/banner.jpg",
                coverImage: "/api/images/media/601/cover.jpg",
              }),
          }),
          eventBus: EventBus.make({
            publish: (event) =>
              Effect.sync(() => {
                events.push(
                  event.type === "Info"
                    ? { type: event.type, message: event.payload.message }
                    : { type: event.type },
                );
              }),
            publishInfo: () => Effect.void,
            withSubscriptionStream: () => Stream.dieMessage("not used in test"),
          }),
        });

        const service = yield* MediaEnrollmentService.pipe(Effect.provide(layer));
        yield* service.enroll(animeInput);

        const [row] = yield* tryDatabasePromise("Failed to query media for add assertion", () =>
          appDb.select().from(media).where(eq(media.id, mediaId)),
        );
        assert(row);

        const persistedRelated = yield* decodeStoredDiscoveryEntriesEffect(
          row.relatedMedia,
          "relatedMedia",
        );
        const persistedRecommended = yield* decodeStoredDiscoveryEntriesEffect(
          row.recommendedMedia,
          "recommendedMedia",
        );
        const persistedSynonyms = yield* decodeStoredSynonymsEffect(row.synonyms);

        assert.deepStrictEqual(row.malId, metadata.malId);
        assert.deepStrictEqual(persistedRelated, metadata.relatedMedia);
        assert.deepStrictEqual(persistedRecommended, metadata.recommendedMedia);
        assert.deepStrictEqual(persistedSynonyms, metadata.synonyms);
        assert.deepStrictEqual(events, [
          {
            type: "Info",
            message: `Added ${metadata.title.romaji} to library`,
          },
        ]);
      }),
    schema,
  }),
);

it.scoped("MediaEnrollmentService.enroll infers light novel media kind when request omits it", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const mediaId = 701;

        yield* insertQualityProfileEffect(appDb, "Default");

        const animeInput = yield* Schema.decodeUnknown(AddMediaInput)({
          id: mediaId,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: "/library/Light Novel",
          use_existing_root: true,
        });

        const layer = makeEnrollmentLayer(appDb, {
          metadataProvider: MediaMetadataProviderService.make({
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata: { ...makeMetadata(mediaId), format: "NOVEL", unitCount: 6 },
              }),
            getSeasonalAnime: () => Effect.dieMessage("not used in test"),
            searchMedia: () => Effect.dieMessage("not used in test"),
          }),
          imageCacheService: MediaImageCacheService.make({
            cacheMetadataImages: () => Effect.succeed({}),
          }),
          eventBus: EventBus.make({
            publish: () => Effect.void,
            publishInfo: () => Effect.void,
            withSubscriptionStream: () => Stream.dieMessage("not used in test"),
          }),
        });

        const service = yield* MediaEnrollmentService.pipe(Effect.provide(layer));
        yield* service.enroll(animeInput);

        const [row] = yield* tryDatabasePromise("Failed to query media for add assertion", () =>
          appDb.select().from(media).where(eq(media.id, mediaId)),
        );
        assert(row);
        assert.deepStrictEqual(row.mediaKind, "light_novel");
      }),
    schema,
  }),
);

function makeEnrollmentLayer(
  db: AppDatabase,
  stubs: {
    metadataProvider: typeof MediaMetadataProviderService.Service;
    imageCacheService: typeof MediaImageCacheService.Service;
    eventBus: typeof EventBus.Service;
  },
) {
  return MediaEnrollmentService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(MediaMetadataProviderService, stubs.metadataProvider),
        Layer.succeed(MediaImageCacheService, stubs.imageCacheService),
        Layer.succeed(EventBus, stubs.eventBus),
        Layer.succeed(FileSystem, FileSystem.make(makeFileSystemStub())),
        Layer.succeed(MediaRepository, makeMediaRepository(db)),
        Layer.succeed(MediaUnitRepository, makeMediaUnitRepository(db)),
        Layer.succeed(QualityProfileRepository, makeQualityProfileRepository(db)),
        Layer.succeed(SystemConfigRepository, makeSystemConfigRepository(db)),
        Layer.succeed(
          SearchBackgroundMissingService,
          SearchBackgroundMissingService.make({
            startMissingUnitSearch: () => Effect.dieMessage("not used in test"),
            triggerSearchMissing: () => Effect.dieMessage("not used in test"),
          }),
        ),
        Layer.succeed(
          OperationsTaskLauncherService,
          OperationsTaskLauncherService.make({
            launch: () => Effect.dieMessage("not used in test"),
          }),
        ),
      ),
    ),
  );
}

const insertQualityProfileEffect = Effect.fn("Test.insertQualityProfile")(function* (
  db: AppDatabase,
  name: string,
) {
  yield* tryDatabasePromise("Failed to insert quality profile for media add test", () =>
    db.insert(qualityProfiles).values({
      allowedQualities: "1080p",
      cutoff: "720p",
      maxSize: null,
      minSize: null,
      name,
      seadexPreferred: false,
      upgradeAllowed: true,
    }),
  );
});

function makeMetadata(id: number): AnimeMetadata {
  return {
    id,
    format: "TV",
    status: "RELEASING",
    title: { romaji: `Media ${id}` },
    bannerImage: "https://images.example/banner.jpg",
    coverImage: "https://images.example/cover.jpg",
    genres: ["Action"],
    studios: ["Studio One"],
    recommendedMedia: [],
    relatedMedia: [],
    synonyms: [],
  };
}

function makeFileSystemStub(): FileSystemShape {
  return {
    copyFile: (from) => failFileSystem("copyFile", from),
    mkdir: () => Effect.void,
    openFile: (path) => failFileSystem("openFile", path),
    readDir: (path) => failFileSystem("readDir", path),
    readFile: (path) => failFileSystem("readFile", path),
    realPath: (path) => failFileSystem("realPath", path),
    remove: (path) => failFileSystem("remove", path),
    rename: (from) => failFileSystem("rename", from),
    stat: (path) => failFileSystem("stat", path),
    writeFile: (path) => failFileSystem("writeFile", path),
  };
}

function failFileSystem<A>(
  operation: string,
  path: string | URL,
): Effect.Effect<A, FileSystemError> {
  return Effect.fail(
    new FileSystemError({
      cause: new Error(`${operation} is not implemented in media-add test stub`),
      message: `${operation} is not implemented in media-add test stub`,
      path: typeof path === "string" ? path : path.toString(),
    }),
  );
}
