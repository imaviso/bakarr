import { assert, it } from "@effect/vitest";
import { Schema } from "effect";

import { AddAnimeInput } from "@/features/media/add/add-media-input.ts";

it("AddAnimeInput decodes valid payload", () => {
  const result = Schema.decodeUnknownEither(AddAnimeInput)({
    id: 42,
    monitor_and_search: true,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [1, 2],
    root_folder: "/library/Media",
  });
  assert.ok(result._tag === "Right");
  if (result._tag === "Right") {
    assert.deepStrictEqual(result.right.id, 42);
    assert.deepStrictEqual(result.right.monitor_and_search, true);
    assert.deepStrictEqual(result.right.root_folder, "/library/Media");
  }
});

it("AddAnimeInput rejects negative ids", () => {
  const result = Schema.decodeUnknownEither(AddAnimeInput)({
    id: -1,
    monitor_and_search: true,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [],
    root_folder: "/lib",
  });
  assert.deepStrictEqual(result._tag, "Left");
});

it("AddAnimeInput rejects missing required fields", () => {
  const result = Schema.decodeUnknownEither(AddAnimeInput)({});
  assert.deepStrictEqual(result._tag, "Left");
});

it("AddAnimeInput accepts use_existing_root option", () => {
  const result = Schema.decodeUnknownEither(AddAnimeInput)({
    id: 5,
    monitor_and_search: false,
    monitored: true,
    profile_name: "HD",
    release_profile_ids: [],
    root_folder: "/lib",
    use_existing_root: true,
  });
  assert.ok(result._tag === "Right");
  if (result._tag === "Right") {
    assert.deepStrictEqual(result.right.use_existing_root, true);
  }
});
