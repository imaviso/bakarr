import { assert, it } from "@effect/vitest";

import {
  UnitFileResolved,
  UnitFileUnmapped,
  UnitFileRootInaccessible,
  UnitFileMissing,
  UnitFileOutsideRoot,
} from "@/features/media/files/media-file-resolution.ts";

it("UnitFileResolved constructs with fileName and filePath", () => {
  const resolved = new UnitFileResolved({ fileName: "ep.mkv", filePath: "/lib/ep.mkv" });
  assert.deepStrictEqual(resolved._tag, "UnitFileResolved");
  assert.deepStrictEqual(resolved.fileName, "ep.mkv");
});

it("UnitFileUnmapped constructs with no fields", () => {
  const unmapped = new UnitFileUnmapped({});
  assert.deepStrictEqual(unmapped._tag, "UnitFileUnmapped");
});

it("UnitFileRootInaccessible holds rootFolder", () => {
  const err = new UnitFileRootInaccessible({ rootFolder: "/lib" });
  assert.deepStrictEqual(err._tag, "UnitFileRootInaccessible");
  assert.deepStrictEqual(err.rootFolder, "/lib");
});

it("UnitFileMissing holds filePath", () => {
  const err = new UnitFileMissing({ filePath: "/lib/ep.mkv" });
  assert.deepStrictEqual(err._tag, "UnitFileMissing");
  assert.deepStrictEqual(err.filePath, "/lib/ep.mkv");
});

it("UnitFileOutsideRoot holds animeRoot and filePath", () => {
  const err = new UnitFileOutsideRoot({ animeRoot: "/lib", filePath: "/other/ep.mkv" });
  assert.deepStrictEqual(err._tag, "UnitFileOutsideRoot");
  assert.deepStrictEqual(err.animeRoot, "/lib");
  assert.deepStrictEqual(err.filePath, "/other/ep.mkv");
});
