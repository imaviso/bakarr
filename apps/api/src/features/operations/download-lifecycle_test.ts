import { assertEquals } from "@std/assert";

import {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "./service.ts";

Deno.test("parseMagnetInfoHash extracts btih from magnet links", () => {
  assertEquals(
    parseMagnetInfoHash("magnet:?xt=urn:btih:ABCDEF1234567890&dn=Example"),
    "abcdef1234567890",
  );
  assertEquals(parseMagnetInfoHash(undefined), undefined);
});

Deno.test("resolveCompletedContentPath prefers matching episode files inside directories", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const first = `${dir}/Show - 01.mkv`;
    const second = `${dir}/Show - 02.mkv`;
    await Deno.writeTextFile(first, "one");
    await Deno.writeTextFile(second, "two");

    assertEquals(await resolveCompletedContentPath(dir, 2), second);
    assertEquals(await resolveCompletedContentPath(first, 1), first);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("resolveBatchContentPaths collects video files from completed batch directories", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const first = `${dir}/Show - 01.mkv`;
    const second = `${dir}/Show - 02.mp4`;
    const ignored = `${dir}/note.txt`;
    await Deno.writeTextFile(first, "one");
    await Deno.writeTextFile(second, "two");
    await Deno.writeTextFile(ignored, "ignore");

    assertEquals(await resolveBatchContentPaths(dir), [first, second]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("resolveBatchContentPaths returns a single file for batch torrents stored as one file", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const file = `${dir}/Show Season Pack.mkv`;
    await Deno.writeTextFile(file, "season");

    assertEquals(await resolveBatchContentPaths(file), [file]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("inferCoveredEpisodeNumbers prefers explicit ranges and falls back to missing tails for batches", () => {
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
});

Deno.test("applyRemotePathMappings rewrites qBittorrent remote paths", () => {
  assertEquals(
    applyRemotePathMappings("/remote/downloads/show/episode.mkv", [[
      "/remote/downloads",
      "/local/downloads",
    ]]),
    ["/local/downloads/show/episode.mkv"],
  );
});

Deno.test("resolveAccessibleDownloadPath uses mapped local paths when remote path is unavailable", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const localRoot = `${dir}/local`;
    await Deno.mkdir(`${localRoot}/show`, { recursive: true });
    const localFile = `${localRoot}/show/episode.mkv`;
    await Deno.writeTextFile(localFile, "video");

    assertEquals(
      await resolveAccessibleDownloadPath(
        "/remote/downloads/show/episode.mkv",
        [["/remote/downloads", localRoot]],
      ),
      localFile,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
