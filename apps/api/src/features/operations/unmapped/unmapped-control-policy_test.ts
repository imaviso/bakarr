import { assert, it } from "@effect/vitest";

import {
  brandMediaId,
  type MediaSearchResult,
  type UnmappedFolder,
} from "@packages/shared/index.ts";
import {
  transitionUnmappedFolderForControlAction,
  transitionUnmappedFoldersForBulkControlAction,
} from "@/features/operations/unmapped/unmapped-control-policy.ts";

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

it("transitionUnmappedFolderForControlAction pauses resumes and resets a folder", () => {
  const failed = makeFolder({
    last_match_error: "rate limited",
    last_matched_at: "2024-01-01T00:00:00.000Z",
    match_attempts: 2,
    match_status: "failed",
    suggested_matches: [
      {
        already_in_library: true,
        id: brandMediaId(20),
        title: { romaji: "Naruto" },
      },
    ],
  });

  const paused = transitionUnmappedFolderForControlAction(failed, "pause");
  const resumed = transitionUnmappedFolderForControlAction(paused, "resume");
  const reset = transitionUnmappedFolderForControlAction(failed, "reset");

  assert.deepStrictEqual(paused.match_status, "paused");
  assert.deepStrictEqual(paused.match_attempts, 2);
  assert.deepStrictEqual(resumed.match_status, "pending");
  assert.deepStrictEqual(resumed.match_attempts, 2);
  assert.deepStrictEqual(reset.match_status, "pending");
  assert.deepStrictEqual(reset.match_attempts, 0);
  assert.deepStrictEqual(reset.last_match_error, undefined);
  assert.deepStrictEqual(reset.suggested_matches, []);
});

it("transitionUnmappedFoldersForBulkControlAction targets only matching statuses", () => {
  const queued = makeFolder({ match_status: "pending", path: "/library/Queued" });
  const paused = makeFolder({ match_status: "paused", path: "/library/Paused" });
  const failed = makeFolder({
    last_match_error: "AniList unavailable",
    match_attempts: 3,
    match_status: "failed",
    path: "/library/Failed",
    suggested_matches: [
      {
        already_in_library: true,
        id: brandMediaId(20),
        title: { romaji: "Naruto" },
      },
    ],
  });
  const done = makeFolder({ match_status: "done", path: "/library/Done" });

  assert.deepStrictEqual(
    transitionUnmappedFoldersForBulkControlAction(
      [queued, paused, failed, done],
      "pause_queued",
    ).map((folder) => [folder.path, folder.match_status, folder.match_attempts]),
    [["/library/Queued", "paused", 0]],
  );
  assert.deepStrictEqual(
    transitionUnmappedFoldersForBulkControlAction(
      [queued, paused, failed, done],
      "resume_paused",
    ).map((folder) => [folder.path, folder.match_status, folder.match_attempts]),
    [["/library/Paused", "pending", 0]],
  );
  assert.deepStrictEqual(
    transitionUnmappedFoldersForBulkControlAction(
      [queued, paused, failed, done],
      "reset_failed",
    ).map((folder) => [
      folder.path,
      folder.match_status,
      folder.match_attempts,
      folder.suggested_matches,
    ]),
    [["/library/Failed", "pending", 0, []]],
  );
  assert.deepStrictEqual(
    transitionUnmappedFoldersForBulkControlAction(
      [queued, paused, failed, done],
      "retry_failed",
    ).map((folder) => [
      folder.path,
      folder.match_status,
      folder.match_attempts,
      folder.suggested_matches,
    ]),
    [["/library/Failed", "pending", 0, []]],
  );
});
