import { assert, it } from "@effect/vitest";
import { Schema } from "effect";

import { AddMediaInput } from "@/features/media/add/add-media-input.ts";

it("AddMediaInput decodes valid payload", () => {
  const result = Schema.decodeUnknownResult(AddMediaInput)({
    id: 42,
    monitor_and_search: true,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [1, 2],
    root_folder: "/library/Media",
  });
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") {
    assert.deepStrictEqual(result.success.id, 42);
    assert.deepStrictEqual(result.success.monitor_and_search, true);
    assert.deepStrictEqual(result.success.root_folder, "/library/Media");
  }
});

it("AddMediaInput rejects negative ids", () => {
  const result = Schema.decodeUnknownResult(AddMediaInput)({
    id: -1,
    monitor_and_search: true,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [],
    root_folder: "/lib",
  });
  assert.deepStrictEqual(result._tag, "Failure");
});

it("AddMediaInput rejects missing required fields", () => {
  const result = Schema.decodeUnknownResult(AddMediaInput)({});
  assert.deepStrictEqual(result._tag, "Failure");
});

it("AddMediaInput accepts use_existing_root option", () => {
  const result = Schema.decodeUnknownResult(AddMediaInput)({
    id: 5,
    monitor_and_search: false,
    monitored: true,
    profile_name: "HD",
    release_profile_ids: [],
    root_folder: "/lib",
    use_existing_root: true,
  });
  assert.ok(result._tag === "Success");
  if (result._tag === "Success") {
    assert.deepStrictEqual(result.success.use_existing_root, true);
  }
});
