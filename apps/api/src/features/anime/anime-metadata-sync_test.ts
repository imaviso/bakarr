import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";
import { brandAnimeId } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { anime } from "@/db/schema.ts";
import type { AnimeMetadata } from "@/features/anime/anilist-model.ts";
import { ImageCacheError } from "@/features/anime/anime-image-cache-service.ts";
import { syncAnimeMetadataEffect } from "@/features/anime/anime-metadata-sync.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredSynonymsEffect,
} from "@/features/anime/decode-support.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped("syncAnimeMetadataEffect stores locally cached image paths", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const animeId = 501;

        yield* insertAnimeRow(appDb, animeId, {
          bannerImage: "/api/images/anime/501/banner-old.jpg",
          coverImage: "/api/images/anime/501/cover-old.jpg",
        });

        let cacheInput:
          | {
              readonly animeId: number;
              readonly bannerImage?: string | null;
              readonly coverImage?: string | null;
            }
          | undefined;

        const metadata = makeMetadata(animeId);

        const result = yield* syncAnimeMetadataEffect({
          imageCacheService: {
            cacheMetadataImages: (input) => {
              cacheInput = input;
              return Effect.succeed({
                bannerImage: "/api/images/anime/501/banner.jpg",
                coverImage: "/api/images/anime/501/cover.jpg",
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
          animeId,
          db: appDb,
          eventPublisher: Option.none(),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* Effect.promise(() =>
          appDb.select().from(anime).where(eq(anime.id, animeId)),
        );

        assert.deepStrictEqual(cacheInput, {
          animeId,
          bannerImage: "https://images.example/banner.jpg",
          coverImage: "https://images.example/cover.jpg",
        });
        assert.deepStrictEqual(result.nextAnimeRow.bannerImage, "/api/images/anime/501/banner.jpg");
        assert.deepStrictEqual(result.nextAnimeRow.coverImage, "/api/images/anime/501/cover.jpg");
        assert.deepStrictEqual(row?.bannerImage, "/api/images/anime/501/banner.jpg");
        assert.deepStrictEqual(row?.coverImage, "/api/images/anime/501/cover.jpg");
      }),
    schema,
  }),
);

it.scoped("syncAnimeMetadataEffect keeps existing image paths if caching fails", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const animeId = 502;

        yield* insertAnimeRow(appDb, animeId, {
          bannerImage: "/api/images/anime/502/banner-old.jpg",
          coverImage: "/api/images/anime/502/cover-old.jpg",
        });

        const result = yield* syncAnimeMetadataEffect({
          imageCacheService: {
            cacheMetadataImages: () =>
              Effect.fail(
                new ImageCacheError({
                  animeId,
                  cause: new Error("cache failed"),
                  message: "Failed to cache anime metadata images",
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
                metadata: makeMetadata(animeId),
              }),
          },
          animeId,
          db: appDb,
          eventPublisher: Option.none(),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* Effect.promise(() =>
          appDb.select().from(anime).where(eq(anime.id, animeId)),
        );

        assert.deepStrictEqual(
          result.nextAnimeRow.bannerImage,
          "/api/images/anime/502/banner-old.jpg",
        );
        assert.deepStrictEqual(
          result.nextAnimeRow.coverImage,
          "/api/images/anime/502/cover-old.jpg",
        );
        assert.deepStrictEqual(row?.bannerImage, "/api/images/anime/502/banner-old.jpg");
        assert.deepStrictEqual(row?.coverImage, "/api/images/anime/502/cover-old.jpg");
      }),
    schema,
  }),
);

it.scoped("syncAnimeMetadataEffect persists enrichment metadata fields from provider output", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const appDb: AppDatabase = db;
        const animeId = 503;

        yield* insertAnimeRow(appDb, animeId, {
          bannerImage: "/api/images/anime/503/banner-old.jpg",
          coverImage: "/api/images/anime/503/cover-old.jpg",
        });

        const metadata: AnimeMetadata = {
          ...makeMetadata(animeId),
          background: "background",
          duration: "24 min",
          favorites: 99,
          malId: 99003,
          members: 123,
          popularity: 12,
          rank: 9,
          rating: "PG-13 - Teens 13 or older",
          recommendedAnime: [
            { id: brandAnimeId(8101), title: { romaji: "Recommendation from enrichment" } },
          ],
          relatedAnime: [
            { id: brandAnimeId(7101), title: { romaji: "Mapped relation one" } },
            { id: brandAnimeId(7102), title: { romaji: "Mapped relation two" } },
          ],
          source: "MANGA",
          synonyms: ["Mapped Alias", "Provider Alias"],
        };

        const result = yield* syncAnimeMetadataEffect({
          imageCacheService: {
            cacheMetadataImages: () =>
              Effect.succeed({
                bannerImage: "/api/images/anime/503/banner.jpg",
                coverImage: "/api/images/anime/503/cover.jpg",
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
          animeId,
          db: appDb,
          eventPublisher: Option.none(),
          nowIso: () => Effect.succeed("2026-04-11T00:00:00.000Z"),
        });

        const [row] = yield* Effect.promise(() =>
          appDb.select().from(anime).where(eq(anime.id, animeId)),
        );
        assert(row);

        const persistedRelated = yield* decodeStoredDiscoveryEntriesEffect(
          row.relatedAnime,
          "relatedAnime",
        );
        const persistedRecommended = yield* decodeStoredDiscoveryEntriesEffect(
          row.recommendedAnime,
          "recommendedAnime",
        );
        const persistedSynonyms = yield* decodeStoredSynonymsEffect(row.synonyms);
        const nextRelated = yield* decodeStoredDiscoveryEntriesEffect(
          result.nextAnimeRow.relatedAnime,
          "relatedAnime",
        );
        const nextRecommended = yield* decodeStoredDiscoveryEntriesEffect(
          result.nextAnimeRow.recommendedAnime,
          "recommendedAnime",
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
        assert.deepStrictEqual(persistedRelated, metadata.relatedAnime);
        assert.deepStrictEqual(persistedRecommended, metadata.recommendedAnime);
        assert.deepStrictEqual(persistedSynonyms, metadata.synonyms);
        assert.deepStrictEqual(nextRelated, metadata.relatedAnime);
        assert.deepStrictEqual(nextRecommended, metadata.recommendedAnime);
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
    db.insert(anime).values({
      id,
      titleRomaji: `Anime ${id}`,
      format: "TV",
      status: "RELEASING",
      genres: "[]",
      studios: "[]",
      profileName: "Default",
      rootFolder: `/library/anime-${id}`,
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
    title: { romaji: `Anime ${id} Updated` },
    bannerImage: "https://images.example/banner.jpg",
    coverImage: "https://images.example/cover.jpg",
    genres: [],
    studios: [],
    recommendedAnime: [],
    relatedAnime: [],
    synonyms: [],
  };
}
