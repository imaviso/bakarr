import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { media, qualityProfiles } from "@/db/schema.ts";
import { AddAnimeInput } from "@/features/media/add/add-media-input.ts";
import { addAnimeEffect } from "@/features/media/add/media-add.ts";
import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import {
  decodeStoredDiscoveryEntriesEffect,
  decodeStoredSynonymsEffect,
} from "@/features/media/shared/decode-support.ts";
import { FileSystemError, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

it.scoped("addAnimeEffect persists MAL backfill and mapped relation metadata", () =>
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
        const animeInput = yield* Schema.decodeUnknown(AddAnimeInput)({
          id: mediaId,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: "/library/My Added Show",
          use_existing_root: true,
        });

        yield* addAnimeEffect({
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
          animeInput,
          db: appDb,
          eventPublisher: {
            publish: (event) =>
              Effect.sync(() => {
                events.push(
                  event.type === "Info"
                    ? { type: event.type, message: event.payload.message }
                    : { type: event.type },
                );
              }),
          },
          fs: makeFileSystemStub(),
          imageCacheService: {
            cacheMetadataImages: () =>
              Effect.succeed({
                bannerImage: "/api/images/media/601/banner.jpg",
                coverImage: "/api/images/media/601/cover.jpg",
              }),
          },
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

const insertQualityProfileEffect = Effect.fn("Test.insertQualityProfile")(function* (
  db: AppDatabase,
  name: string,
) {
  yield* Effect.promise(() =>
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
