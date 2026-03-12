import { assertEquals } from "@std/assert";

import {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "./download-lifecycle.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { Effect } from "effect";

const filesystemTestPermissions: Deno.PermissionOptions = {
  read: true,
  write: true,
};

function filesystemTest(name: string, fn: () => void | Promise<void>) {
  Deno.test({ fn, name, permissions: filesystemTestPermissions });
}

/** Real filesystem for integration tests */
const fs: FileSystemShape = {
  readDir: (path) =>
    Effect.tryPromise({
      try: () => Array.fromAsync(Deno.readDir(path)),
      catch: (cause) =>
        new FileSystemError({ cause, message: "readDir failed", path }),
    }),
  realPath: (path) =>
    Effect.tryPromise({
      try: () => Deno.realPath(path),
      catch: (cause) =>
        new FileSystemError({ cause, message: "realPath failed", path }),
    }),
  stat: (path) =>
    Effect.tryPromise({
      try: () => Deno.stat(path),
      catch: (cause) =>
        new FileSystemError({ cause, message: "stat failed", path }),
    }),
  mkdir: (path, options) =>
    Effect.tryPromise({
      try: () => Deno.mkdir(path, options),
      catch: (cause) =>
        new FileSystemError({ cause, message: "mkdir failed", path }),
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
  remove: (path, options) =>
    Effect.tryPromise({
      try: () => Deno.remove(path, options),
      catch: (cause) =>
        new FileSystemError({ cause, message: "remove failed", path }),
    }),
};

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

      assertEquals(await resolveCompletedContentPath(fs, dir, 2), second);
      assertEquals(await resolveCompletedContentPath(fs, first, 1), first);
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

      assertEquals(await resolveBatchContentPaths(fs, dir), [first, second]);
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

      assertEquals(await resolveBatchContentPaths(fs, file), [file]);
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
  "resolveAccessibleDownloadPath uses mapped local paths when remote path is unavailable",
  async () => {
    const dir = await Deno.makeTempDir();

    try {
      const localRoot = `${dir}/local`;
      await Deno.mkdir(`${localRoot}/show`, { recursive: true });
      const localFile = `${localRoot}/show/episode.mkv`;
      await Deno.writeTextFile(localFile, "video");

      assertEquals(
        await resolveAccessibleDownloadPath(
          fs,
          "/remote/downloads/show/episode.mkv",
          [["/remote/downloads", localRoot]],
        ),
        localFile,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);
