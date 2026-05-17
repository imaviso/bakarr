import { assert, it } from "@effect/vitest";

import {
  EpisodeFileResolved,
  EpisodeFileUnmapped,
  EpisodeFileRootInaccessible,
  EpisodeFileMissing,
  EpisodeFileOutsideRoot,
} from "@/features/media/files/media-file-resolution.ts";

it("EpisodeFileResolved constructs with fileName and filePath", () => {
  const resolved = new EpisodeFileResolved({ fileName: "ep.mkv", filePath: "/lib/ep.mkv" });
  assert.deepStrictEqual(resolved._tag, "EpisodeFileResolved");
  assert.deepStrictEqual(resolved.fileName, "ep.mkv");
});

it("EpisodeFileUnmapped constructs with no fields", () => {
  const unmapped = new EpisodeFileUnmapped({});
  assert.deepStrictEqual(unmapped._tag, "EpisodeFileUnmapped");
});

it("EpisodeFileRootInaccessible holds rootFolder", () => {
  const err = new EpisodeFileRootInaccessible({ rootFolder: "/lib" });
  assert.deepStrictEqual(err._tag, "EpisodeFileRootInaccessible");
  assert.deepStrictEqual(err.rootFolder, "/lib");
});

it("EpisodeFileMissing holds filePath", () => {
  const err = new EpisodeFileMissing({ filePath: "/lib/ep.mkv" });
  assert.deepStrictEqual(err._tag, "EpisodeFileMissing");
  assert.deepStrictEqual(err.filePath, "/lib/ep.mkv");
});

it("EpisodeFileOutsideRoot holds animeRoot and filePath", () => {
  const err = new EpisodeFileOutsideRoot({ animeRoot: "/lib", filePath: "/other/ep.mkv" });
  assert.deepStrictEqual(err._tag, "EpisodeFileOutsideRoot");
  assert.deepStrictEqual(err.animeRoot, "/lib");
  assert.deepStrictEqual(err.filePath, "/other/ep.mkv");
});
