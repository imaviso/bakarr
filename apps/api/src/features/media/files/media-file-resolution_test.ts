import { assert, it } from "@effect/vitest";

import {
  UnitFileResolveError,
  UnitFileResolved,
} from "@/features/media/files/media-file-resolution.ts";

it("UnitFileResolved constructs with fileName and filePath", () => {
  const resolved = new UnitFileResolved({ fileName: "ep.mkv", filePath: "/lib/ep.mkv" });
  assert.deepStrictEqual(resolved._tag, "UnitFileResolved");
  assert.deepStrictEqual(resolved.fileName, "ep.mkv");
});

it("UnitFileResolveError constructs unmapped with media and unit context", () => {
  const error = new UnitFileResolveError({
    mediaId: 1,
    message: "MediaUnit file not found",
    reason: "unmapped",
    unitNumber: 2,
  });
  assert.deepStrictEqual(error._tag, "UnitFileResolveError");
  assert.deepStrictEqual(error.reason, "unmapped");
  assert.deepStrictEqual(error.message, "MediaUnit file not found");
  assert.deepStrictEqual(error.mediaId, 1);
  assert.deepStrictEqual(error.unitNumber, 2);
  assert.deepStrictEqual(error.filePath, undefined);
  assert.deepStrictEqual(error.rootFolder, undefined);
});

it("UnitFileResolveError holds optional filePath and rootFolder", () => {
  const error = new UnitFileResolveError({
    filePath: "/other/ep.mkv",
    mediaId: 1,
    message: "MediaUnit file mapping is invalid",
    reason: "outside-root",
    rootFolder: "/lib",
    unitNumber: 2,
  });
  assert.deepStrictEqual(error.reason, "outside-root");
  assert.deepStrictEqual(error.filePath, "/other/ep.mkv");
  assert.deepStrictEqual(error.rootFolder, "/lib");
});

it("UnitFileResolveError reason is limited to the four failure modes", () => {
  const reasons = ["unmapped", "missing", "root-inaccessible", "outside-root"] as const;
  for (const reason of reasons) {
    const error = new UnitFileResolveError({
      mediaId: 1,
      message: "x",
      reason,
      unitNumber: 1,
    });
    assert.deepStrictEqual(error.reason, reason);
  }
});
