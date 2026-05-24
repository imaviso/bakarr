import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  brandMediaId,
  type MediaSearchResult,
  type UnmappedFolder,
} from "@packages/shared/index.ts";
import * as schema from "@/db/schema.ts";
import { appConfig } from "@/db/schema.ts";
import { encodeConfigCore } from "@/features/system/config-codec.ts";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import { loadUnmappedFolderSnapshot } from "@/features/operations/unmapped/unmapped-scan-snapshot-support.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { makeSystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import {
  countCompletedUnmappedMatches,
  ensureFolderMatchStatus,
  prepareUnmappedFoldersForScan,
} from "@/features/operations/unmapped/unmapped-folder-list-support.ts";
import { loadUnmappedFolderVideoSize } from "@/features/operations/unmapped/unmapped-scan-video-support.ts";

function makeFolder(input: Partial<UnmappedFolder> & Pick<UnmappedFolder, "match_status">) {
  return {
    name: "Naruto Archive",
    path: "/library/Naruto Archive",
    search_queries: ["Naruto Archive"],
    size: 0,
    suggested_matches: [] satisfies MediaSearchResult[],
    ...input,
  } satisfies UnmappedFolder;
}

it.scoped("loadUnmappedFolderVideoSize sums nested video files", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const seasonDir = `${root}/Season 1`;
      yield* fs.mkdir(seasonDir, { recursive: true });
      yield* fs.writeFile(`${seasonDir}/episode-01.mkv`, new Uint8Array(10));
      yield* fs.writeFile(`${seasonDir}/episode-02.mp4`, new Uint8Array(15));
      yield* writeTextFile(fs, `${seasonDir}/readme.txt`, "ignore me");

      const size = yield* loadUnmappedFolderVideoSize(fs, root);

      assert.deepStrictEqual(size, 25);
    }),
  ),
);

it.scoped("loadUnmappedFolderVideoSize fails when folder is inaccessible", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(loadUnmappedFolderVideoSize(fs, `${root}/missing`));

      assert.deepStrictEqual(exit._tag, "Failure");
    }),
  ),
);

it.scoped("loadUnmappedFolderSnapshot scans anime, manga, and light novel roots", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    withSqliteTestDbEffect({
      schema,
      run: (db, databaseFile) =>
        Effect.gen(function* () {
          const animeRoot = `${root}/anime`;
          const mangaRoot = `${root}/manga`;
          const lightNovelRoot = `${root}/light-novels`;
          yield* fs.mkdir(`${animeRoot}/Anime Folder`, { recursive: true });
          yield* fs.mkdir(`${mangaRoot}/Manga Folder`, { recursive: true });
          yield* fs.mkdir(`${lightNovelRoot}/Light Novel Folder`, { recursive: true });

          const defaults = makeDefaultConfig(databaseFile);
          const encodedDefaults = yield* Schema.encode(ConfigCoreSchema)(defaults);
          const decodedConfig = yield* Schema.decodeUnknown(ConfigCoreSchema)({
            ...encodedDefaults,
            library: {
              ...encodedDefaults.library,
              anime_path: animeRoot,
              manga_path: mangaRoot,
              light_novel_path: lightNovelRoot,
            },
          });
          const configData = yield* encodeConfigCore(decodedConfig);

          yield* tryDatabasePromise("Failed to seed appConfig for unmapped scan test", () =>
            db.insert(appConfig).values({
              id: 1,
              data: configData,
              updatedAt: "2024-01-01T00:00:00.000Z",
            }),
          );

          const snapshot = yield* loadUnmappedFolderSnapshot({
            db,
            fs,
            nowIso: () => Effect.succeed("2024-01-01T00:00:00.000Z"),
            roots: () =>
              Effect.succeed([
                { mediaKind: "anime", path: animeRoot },
                { mediaKind: "manga", path: mangaRoot },
                { mediaKind: "light_novel", path: lightNovelRoot },
              ]),
            systemUnmappedRepository: makeSystemUnmappedRepository(db),
            tryDatabasePromise,
          });

          assert.deepStrictEqual(
            snapshot.folders.map((folder) => [folder.name, folder.media_kind]),
            [
              ["Anime Folder", "anime"],
              ["Manga Folder", "manga"],
              ["Light Novel Folder", "light_novel"],
            ],
          );
        }),
    }),
  ),
);

it("ensureFolderMatchStatus preserves cached size and source media kind", () => {
  const folder = {
    match_status: "pending" as const,
    media_kind: "manga" as const,
    name: "Series",
    path: "/library/Series",
    search_queries: ["Series"],
    size: 0,
    suggested_matches: [],
  };

  const merged = ensureFolderMatchStatus(folder, {
    ...folder,
    match_attempts: 2,
    match_status: "failed",
    size: 2048,
    suggested_matches: [
      {
        format: "TV",
        id: brandMediaId(42),
        status: "RELEASING",
        title: { romaji: "Series" },
      },
    ],
  });

  assert.deepStrictEqual(merged.size, 2048);
  assert.deepStrictEqual(merged.match_status, "failed");
  assert.deepStrictEqual(merged.match_attempts, 2);
  assert.deepStrictEqual(merged.media_kind, "manga");
});

it("prepareUnmappedFoldersForScan retries stale matching and retryable failed folders", () => {
  const discovered = makeFolder({
    match_status: "pending",
    name: "Naruto Archive",
    path: "/library/Naruto Archive",
  });
  const staleMatching = makeFolder({
    last_matched_at: "2024-01-01T00:00:00.000Z",
    match_attempts: 0,
    match_status: "matching",
    name: "Old Naruto Name",
    path: "/library/Naruto Archive",
    size: 2048,
  });
  const retryableFailed = makeFolder({
    last_match_error: "rate limited",
    last_matched_at: "2024-01-01T00:00:00.000Z",
    match_attempts: 1,
    match_status: "failed",
    path: "/library/Retryable",
  });

  const folders = prepareUnmappedFoldersForScan(
    [discovered, { ...discovered, name: "Retryable", path: "/library/Retryable" }],
    new Map([
      [staleMatching.path, staleMatching],
      [retryableFailed.path, retryableFailed],
    ]),
  );

  assert.deepStrictEqual(
    folders.map((folder) => [folder.name, folder.path, folder.match_status, folder.match_attempts]),
    [
      ["Naruto Archive", "/library/Naruto Archive", "pending", 0],
      ["Retryable", "/library/Retryable", "pending", 1],
    ],
  );
  assert.deepStrictEqual(folders[0]?.size, 2048);
});

it("prepareUnmappedFoldersForScan preserves completed and exhausted failed folders", () => {
  const completed = makeFolder({
    last_matched_at: "2024-01-01T00:00:00.000Z",
    match_status: "done",
    path: "/library/Done",
  });
  const exhaustedFailed = makeFolder({
    last_match_error: "AniList unavailable",
    last_matched_at: "2024-01-01T00:00:00.000Z",
    match_attempts: 3,
    match_status: "failed",
    path: "/library/Failed",
  });

  const folders = prepareUnmappedFoldersForScan(
    [
      makeFolder({ match_status: "pending", name: "Done", path: "/library/Done" }),
      makeFolder({ match_status: "pending", name: "Failed", path: "/library/Failed" }),
    ],
    new Map([
      [completed.path, completed],
      [exhaustedFailed.path, exhaustedFailed],
    ]),
  );

  assert.deepStrictEqual(
    folders.map((folder) => [folder.name, folder.match_status, folder.match_attempts]),
    [
      ["Done", "done", 0],
      ["Failed", "failed", 3],
    ],
  );
  assert.deepStrictEqual(countCompletedUnmappedMatches(folders), 2);
});
