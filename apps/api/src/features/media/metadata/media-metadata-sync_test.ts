import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { brandMediaId } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { media } from "@/db/schema.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import {
  ImageCacheError,
  MediaImageCacheService,
} from "@/features/media/metadata/media-image-cache-service.ts";
import { syncMediaMetadataEffect } from "@/features/media/metadata/media-metadata-sync.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredSynonymsEffect,
} from "@/features/media/shared/decode-support.ts";
import { tryDatabaseQuery } from "@/infra/effect/db.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { makeMediaRepository, makeSystemLogRepository } from "@/test/repository-factories.ts";
import { Effect, Option } from "effect";

it.effect("syncMediaMetadataEffect stores locally cached image paths", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const mediaId = 501;

        yield* insertAnimeRow(appDb, mediaId, {
          bannerImage: "/api/images/media/501/banner-old.jpg",
          coverImage: "/api/images/media/501/cover-old.jpg",
        });

        let cacheInput:
          | {
              readonly mediaId: number;
              readonly bannerImage?: string | null;
              readonly coverImage?: string | null;
            }
          | undefined;

        const metadata = makeMetadata(mediaId);

        const result = yield* syncMediaMetadataEffect({
          imageCacheService: MediaImageCacheService.of({
            cacheMetadataImages: (input) => {
              cacheInput = input;
              return Effect.succeed({
                bannerImage: "/api/images/media/501/banner.jpg",
                coverImage: "/api/images/media/501/cover.jpg",
              });
            },
          }),
          metadataProvider: MediaMetadataProviderService.of({
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata,
              }),
            getSeasonalAnime: () => Effect.die(new Error("not used in test")),
            searchMedia: () => Effect.die(new Error("not used in test")),
          }),
          mediaId,
          eventPublisher: Option.none(),
          mediaRepository: makeMediaRepository(appDb, client),
          systemLogRepository: makeSystemLogRepository(appDb, client),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* tryDatabaseQuery(
          "Failed to query media for sync assertion",
          appDb.select().from(media).where(eq(media.id, mediaId)).prepare().effect(),
        );

        assert.deepStrictEqual(cacheInput, {
          mediaId,
          bannerImage: "https://images.example/banner.jpg",
          coverImage: "https://images.example/cover.jpg",
        });
        assert.deepStrictEqual(result.nextMediaRow.bannerImage, "/api/images/media/501/banner.jpg");
        assert.deepStrictEqual(result.nextMediaRow.coverImage, "/api/images/media/501/cover.jpg");
        assert.deepStrictEqual(row?.bannerImage, "/api/images/media/501/banner.jpg");
        assert.deepStrictEqual(row?.coverImage, "/api/images/media/501/cover.jpg");
      }),
    schema,
  }),
);

it.effect("syncMediaMetadataEffect keeps existing image paths if caching fails", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const mediaId = 502;

        yield* insertAnimeRow(appDb, mediaId, {
          bannerImage: "/api/images/media/502/banner-old.jpg",
          coverImage: "/api/images/media/502/cover-old.jpg",
        });

        const result = yield* syncMediaMetadataEffect({
          imageCacheService: MediaImageCacheService.of({
            cacheMetadataImages: () =>
              Effect.fail(
                new ImageCacheError({
                  mediaId,
                  cause: new Error("cache failed"),
                  message: "Failed to cache media metadata images",
                }),
              ),
          }),
          metadataProvider: MediaMetadataProviderService.of({
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata: makeMetadata(mediaId),
              }),
            getSeasonalAnime: () => Effect.die(new Error("not used in test")),
            searchMedia: () => Effect.die(new Error("not used in test")),
          }),
          mediaId,
          eventPublisher: Option.none(),
          mediaRepository: makeMediaRepository(appDb, client),
          systemLogRepository: makeSystemLogRepository(appDb, client),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* tryDatabaseQuery(
          "Failed to query media for image cache failure assertion",
          appDb.select().from(media).where(eq(media.id, mediaId)).prepare().effect(),
        );

        assert.deepStrictEqual(
          result.nextMediaRow.bannerImage,
          "/api/images/media/502/banner-old.jpg",
        );
        assert.deepStrictEqual(
          result.nextMediaRow.coverImage,
          "/api/images/media/502/cover-old.jpg",
        );
        assert.deepStrictEqual(row?.bannerImage, "/api/images/media/502/banner-old.jpg");
        assert.deepStrictEqual(row?.coverImage, "/api/images/media/502/cover-old.jpg");
      }),
    schema,
  }),
);

it.effect("syncMediaMetadataEffect persists enrichment metadata fields from provider output", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const mediaId = 503;

        yield* insertAnimeRow(appDb, mediaId, {
          bannerImage: "/api/images/media/503/banner-old.jpg",
          coverImage: "/api/images/media/503/cover-old.jpg",
        });

        const metadata: AnimeMetadata = {
          ...makeMetadata(mediaId),
          background: "background",
          duration: "24 min",
          favorites: 99,
          malId: 99003,
          members: 123,
          popularity: 12,
          rank: 9,
          rating: "PG-13 - Teens 13 or older",
          recommendedMedia: [
            { id: brandMediaId(8101), title: { romaji: "Recommendation from enrichment" } },
          ],
          relatedMedia: [
            { id: brandMediaId(7101), title: { romaji: "Mapped relation one" } },
            { id: brandMediaId(7102), title: { romaji: "Mapped relation two" } },
          ],
          source: "MANGA",
          synonyms: ["Mapped Alias", "Provider Alias"],
        };

        const result = yield* syncMediaMetadataEffect({
          imageCacheService: MediaImageCacheService.of({
            cacheMetadataImages: () =>
              Effect.succeed({
                bannerImage: "/api/images/media/503/banner.jpg",
                coverImage: "/api/images/media/503/cover.jpg",
              }),
          }),
          metadataProvider: MediaMetadataProviderService.of({
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata,
              }),
            getSeasonalAnime: () => Effect.die(new Error("not used in test")),
            searchMedia: () => Effect.die(new Error("not used in test")),
          }),
          mediaId,
          eventPublisher: Option.none(),
          mediaRepository: makeMediaRepository(appDb, client),
          systemLogRepository: makeSystemLogRepository(appDb, client),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* tryDatabaseQuery(
          "Failed to query media for enrichment assertion",
          appDb.select().from(media).where(eq(media.id, mediaId)).prepare().effect(),
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
        const nextRelated = yield* decodeStoredDiscoveryEntriesEffect(
          result.nextMediaRow.relatedMedia,
          "relatedMedia",
        );
        const nextRecommended = yield* decodeStoredDiscoveryEntriesEffect(
          result.nextMediaRow.recommendedMedia,
          "recommendedMedia",
        );
        const nextSynonyms = yield* decodeStoredSynonymsEffect(result.nextMediaRow.synonyms);

        assert.deepStrictEqual(row.malId, 99003);
        assert.deepStrictEqual(row.background, "background");
        assert.deepStrictEqual(row.duration, "24 min");
        assert.deepStrictEqual(row.favorites, 99);
        assert.deepStrictEqual(row.members, 123);
        assert.deepStrictEqual(row.popularity, 12);
        assert.deepStrictEqual(row.rank, 9);
        assert.deepStrictEqual(row.rating, "PG-13 - Teens 13 or older");
        assert.deepStrictEqual(row.source, "MANGA");
        assert.deepStrictEqual(result.nextMediaRow.malId, 99003);
        assert.deepStrictEqual(persistedRelated, metadata.relatedMedia);
        assert.deepStrictEqual(persistedRecommended, metadata.recommendedMedia);
        assert.deepStrictEqual(persistedSynonyms, metadata.synonyms);
        assert.deepStrictEqual(nextRelated, metadata.relatedMedia);
        assert.deepStrictEqual(nextRecommended, metadata.recommendedMedia);
        assert.deepStrictEqual(nextSynonyms, metadata.synonyms);
      }),
    schema,
  }),
);

const insertAnimeRow = Effect.fn("Test.insertAnimeRow")(function* (
  db: AppDatabase,
  id: number,
  input: {
    readonly bannerImage: string;
    readonly coverImage: string;
  },
) {
  yield* tryDatabaseQuery(
    "Failed to insert test anime row for metadata sync",
    db
      .insert(media)
      .values({
        id,
        titleRomaji: `Media ${id}`,
        format: "TV",
        status: "RELEASING",
        genres: "[]",
        studios: "[]",
        profileName: "Default",
        rootFolder: `/library/media-${id}`,
        addedAt: "2026-04-10T00:00:00.000Z",
        releaseProfileIds: "[]",
        monitored: true,
        bannerImage: input.bannerImage,
        coverImage: input.coverImage,
      })
      .prepare()
      .effect(),
  );
});

function makeMetadata(id: number): AnimeMetadata {
  return {
    id,
    format: "TV",
    status: "RELEASING",
    title: { romaji: `Media ${id} Updated` },
    bannerImage: "https://images.example/banner.jpg",
    coverImage: "https://images.example/cover.jpg",
    genres: [],
    studios: [],
    recommendedMedia: [],
    relatedMedia: [],
    synonyms: [],
  };
}
