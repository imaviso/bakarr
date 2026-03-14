import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodes,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { runTestEffect } from "../../test/effect-test.ts";

const filesystemTestPermissions: Deno.PermissionOptions = {
  read: true,
  write: true,
};

function filesystemTest(name: string, fn: () => void | Promise<void>) {
  Deno.test({ fn, name, permissions: filesystemTestPermissions });
}

/** Real filesystem for integration tests */
const fs: FileSystemShape = {
  openFile: (path, options) =>
    Effect.acquireRelease(
      Effect.tryPromise({
        try: () => Deno.open(path, options),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "openFile failed",
            path: toPathString(path),
          }),
      }),
      (file) => Effect.sync(() => file.close()),
    ),
  readFile: (path) =>
    Effect.tryPromise({
      try: () => Deno.readFile(path),
      catch: (cause) =>
        new FileSystemError({
          cause,
          message: "readFile failed",
          path: toPathString(path),
        }),
    }),
  readDir: (path) =>
    Effect.tryPromise({
      try: () => Array.fromAsync(Deno.readDir(path)),
      catch: (cause) =>
        new FileSystemError({
          cause,
          message: "readDir failed",
          path: toPathString(path),
        }),
    }),
  realPath: (path) =>
    Effect.tryPromise({
      try: () => Deno.realPath(path),
      catch: (cause) =>
        new FileSystemError({
          cause,
          message: "realPath failed",
          path: toPathString(path),
        }),
    }),
  stat: (path) =>
    Effect.tryPromise({
      try: () => Deno.stat(path),
      catch: (cause) =>
        new FileSystemError({
          cause,
          message: "stat failed",
          path: toPathString(path),
        }),
    }),
  mkdir: (path, options) =>
    Effect.tryPromise({
      try: () => Deno.mkdir(path, options),
      catch: (cause) =>
        new FileSystemError({
          cause,
          message: "mkdir failed",
          path: toPathString(path),
        }),
    }),
  rename: (from, to) =>
    Effect.tryPromise({
      try: () => Deno.rename(from, to),
      catch: (cause) =>
        new FileSystemError({ cause, message: "rename failed", path: from }),
    }),
  copyFile: (from, to) =>
    Effect.tryPromise({
      try: () => Deno.copyFile(from, to),
      catch: (cause) =>
        new FileSystemError({ cause, message: "copyFile failed", path: from }),
    }),
  writeFile: (path, data) =>
    Effect.tryPromise({
      try: () => Deno.writeFile(path, data),
      catch: (cause) =>
        new FileSystemError({
          cause,
          message: "writeFile failed",
          path: toPathString(path),
        }),
    }),
  remove: (path, options) =>
    Effect.tryPromise({
      try: () => Deno.remove(path, options),
      catch: (cause) =>
        new FileSystemError({
          cause,
          message: "remove failed",
          path: toPathString(path),
        }),
    }),
};

function toPathString(path: string | URL) {
  return typeof path === "string" ? path : path.toString();
}

filesystemTest("parseMagnetInfoHash extracts btih from magnet links", () => {
  assertEquals(
    parseMagnetInfoHash("magnet:?xt=urn:btih:ABCDEF1234567890&dn=Example"),
    "abcdef1234567890",
  );
  assertEquals(parseMagnetInfoHash(undefined), undefined);
});

filesystemTest(
  "resolveCompletedContentPath prefers matching episode files inside directories",
  async () => {
    const dir = await Deno.makeTempDir();

    try {
      const first = `${dir}/Show - 01.mkv`;
      const second = `${dir}/Show - 02.mkv`;
      await Deno.writeTextFile(first, "one");
      await Deno.writeTextFile(second, "two");

      assertEquals(
        await runTestEffect(resolveCompletedContentPath(fs, dir, 2)),
        second,
      );
      assertEquals(
        await runTestEffect(resolveCompletedContentPath(fs, first, 1)),
        first,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

filesystemTest(
  "resolveBatchContentPaths collects video files from completed batch directories",
  async () => {
    const dir = await Deno.makeTempDir();

    try {
      const first = `${dir}/Show - 01.mkv`;
      const second = `${dir}/Show - 02.mp4`;
      const ignored = `${dir}/note.txt`;
      await Deno.writeTextFile(first, "one");
      await Deno.writeTextFile(second, "two");
      await Deno.writeTextFile(ignored, "ignore");

      assertEquals(await runTestEffect(resolveBatchContentPaths(fs, dir)), [
        first,
        second,
      ]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

filesystemTest(
  "resolveBatchContentPaths returns a single file for batch torrents stored as one file",
  async () => {
    const dir = await Deno.makeTempDir();

    try {
      const file = `${dir}/Show Season Pack.mkv`;
      await Deno.writeTextFile(file, "season");

      assertEquals(await runTestEffect(resolveBatchContentPaths(fs, file)), [
        file,
      ]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

filesystemTest(
  "inferCoveredEpisodeNumbers prefers explicit ranges and falls back to missing tails for batches",
  () => {
    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [3, 4, 5],
        isBatch: true,
        missingEpisodes: [3, 4, 5, 6],
        requestedEpisode: 3,
      }),
      [3, 4, 5],
    );

    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [],
        isBatch: true,
        missingEpisodes: [5, 6, 7],
        requestedEpisode: 5,
      }),
      [5, 6, 7],
    );

    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [],
        isBatch: true,
        missingEpisodes: [5, 6, 8, 9],
        requestedEpisode: 5,
      }),
      [5, 6],
    );

    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [],
        isBatch: false,
        missingEpisodes: [5, 6, 7],
        requestedEpisode: 5,
      }),
      [5],
    );
  },
);

filesystemTest(
  "applyRemotePathMappings rewrites qBittorrent remote paths",
  () => {
    assertEquals(
      applyRemotePathMappings("/remote/downloads/show/episode.mkv", [[
        "/remote/downloads",
        "/local/downloads",
      ]]),
      ["/local/downloads/show/episode.mkv"],
    );
  },
);

filesystemTest(
  "covered episode serialization round-trips optional values",
  () => {
    assertEquals(toCoveredEpisodesJson([1, 2, 3]), "[1,2,3]");
    assertEquals(parseCoveredEpisodes("[1,2,3]"), [1, 2, 3]);
    assertEquals(toCoveredEpisodesJson([]), null);
    assertEquals(parseCoveredEpisodes(null), []);
  },
);

filesystemTest(
  "applyRemotePathMappings returns multiple matching candidates and skips invalid mappings",
  () => {
    assertEquals(
      applyRemotePathMappings("/remote/downloads/show/episode.mkv", [
        ["", "/ignored"],
        ["/different", "/ignored"],
        ["/remote", "/mnt/remote"],
        ["/remote/downloads", "/data/downloads"],
      ]),
      [
        "/mnt/remote/downloads/show/episode.mkv",
        "/data/downloads/show/episode.mkv",
      ],
    );
  },
);

filesystemTest(
  "resolveAccessibleDownloadPath uses mapped local paths when remote path is unavailable",
  async () => {
    const dir = await Deno.makeTempDir();

    try {
      const localRoot = `${dir}/local`;
      await Deno.mkdir(`${localRoot}/show`, { recursive: true });
      const localFile = `${localRoot}/show/episode.mkv`;
      await Deno.writeTextFile(localFile, "video");

      assertEquals(
        await runTestEffect(
          resolveAccessibleDownloadPath(
            fs,
            "/remote/downloads/show/episode.mkv",
            [["/remote/downloads", localRoot]],
          ),
        ),
        localFile,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);
