import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { media } from "@/db/schema.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";
import { syncAnimeMetadataEffect } from "@/features/media/metadata/media-metadata-sync.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredSynonymsEffect,
} from "@/features/media/shared/decode-support.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped("syncAnimeMetadataEffect stores locally cached image paths", () =>
  withSqliteTestDbEffect({
    run: (db) =>
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

        const result = yield* syncAnimeMetadataEffect({
          imageCacheService: {
            cacheMetadataImages: (input) => {
              cacheInput = input;
              return Effect.succeed({
                bannerImage: "/api/images/media/501/banner.jpg",
                coverImage: "/api/images/media/501/cover.jpg",
              });
            },
          },
          metadataProvider: {
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata,
              }),
          },
          mediaId,
          db: appDb,
          eventPublisher: Option.none(),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* Effect.promise(() =>
          appDb.select().from(media).where(eq(media.id, mediaId)),
        );

        assert.deepStrictEqual(cacheInput, {
          mediaId,
          bannerImage: "https://images.example/banner.jpg",
          coverImage: "https://images.example/cover.jpg",
        });
        assert.deepStrictEqual(result.nextAnimeRow.bannerImage, "/api/images/media/501/banner.jpg");
        assert.deepStrictEqual(result.nextAnimeRow.coverImage, "/api/images/media/501/cover.jpg");
        assert.deepStrictEqual(row?.bannerImage, "/api/images/media/501/banner.jpg");
        assert.deepStrictEqual(row?.coverImage, "/api/images/media/501/cover.jpg");
      }),
    schema,
  }),
);

it.scoped("syncAnimeMetadataEffect keeps existing image paths if caching fails", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const mediaId = 502;

        yield* insertAnimeRow(appDb, mediaId, {
          bannerImage: "/api/images/media/502/banner-old.jpg",
          coverImage: "/api/images/media/502/cover-old.jpg",
        });

        const result = yield* syncAnimeMetadataEffect({
          imageCacheService: {
            cacheMetadataImages: () =>
              Effect.fail(
                new ImageCacheError({
                  mediaId,
                  cause: new Error("cache failed"),
                  message: "Failed to cache media metadata images",
                }),
              ),
          },
          metadataProvider: {
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata: makeMetadata(mediaId),
              }),
          },
          mediaId,
          db: appDb,
          eventPublisher: Option.none(),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* Effect.promise(() =>
          appDb.select().from(media).where(eq(media.id, mediaId)),
        );

        assert.deepStrictEqual(
          result.nextAnimeRow.bannerImage,
          "/api/images/media/502/banner-old.jpg",
        );
        assert.deepStrictEqual(
          result.nextAnimeRow.coverImage,
          "/api/images/media/502/cover-old.jpg",
        );
        assert.deepStrictEqual(row?.bannerImage, "/api/images/media/502/banner-old.jpg");
        assert.deepStrictEqual(row?.coverImage, "/api/images/media/502/cover-old.jpg");
      }),
    schema,
  }),
);

it.scoped("syncAnimeMetadataEffect persists enrichment metadata fields from provider output", () =>
  withSqliteTestDbEffect({
    run: (db) =>
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

        const result = yield* syncAnimeMetadataEffect({
          imageCacheService: {
            cacheMetadataImages: () =>
              Effect.succeed({
                bannerImage: "/api/images/media/503/banner.jpg",
                coverImage: "/api/images/media/503/cover.jpg",
              }),
          },
          metadataProvider: {
            getAnimeMetadataById: () =>
              Effect.succeed({
                _tag: "Found",
                enrichment: {
                  _tag: "Degraded",
                  reason: { _tag: "AniDbNoEpisodeMetadata" },
                },
                metadata,
              }),
          },
          mediaId,
          db: appDb,
          eventPublisher: Option.none(),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* Effect.promise(() =>
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
        const nextRelated = yield* decodeStoredDiscoveryEntriesEffect(
          result.nextAnimeRow.relatedMedia,
          "relatedMedia",
        );
        const nextRecommended = yield* decodeStoredDiscoveryEntriesEffect(
          result.nextAnimeRow.recommendedMedia,
          "recommendedMedia",
        );
        const nextSynonyms = yield* decodeStoredSynonymsEffect(result.nextAnimeRow.synonyms);

        assert.deepStrictEqual(row.malId, 99003);
        assert.deepStrictEqual(row.background, "background");
        assert.deepStrictEqual(row.duration, "24 min");
        assert.deepStrictEqual(row.favorites, 99);
        assert.deepStrictEqual(row.members, 123);
        assert.deepStrictEqual(row.popularity, 12);
        assert.deepStrictEqual(row.rank, 9);
        assert.deepStrictEqual(row.rating, "PG-13 - Teens 13 or older");
        assert.deepStrictEqual(row.source, "MANGA");
        assert.deepStrictEqual(result.nextAnimeRow.malId, 99003);
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
  yield* Effect.promise(() =>
    db.insert(media).values({
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
    }),
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
