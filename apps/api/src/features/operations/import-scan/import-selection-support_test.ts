import { assert, it } from "@effect/vitest";
import { brandMediaId } from "@packages/shared/index.ts";

import { applyImportCandidateSelection } from "@/features/operations/import-scan/import-selection-support.ts";

it("applyImportCandidateSelection selects files for candidate", () => {
  const result = applyImportCandidateSelection({
    candidate_id: brandMediaId(7),
    candidate_title: "Example Show",
    files: [
      {
        unit_number: 1,
        filename: "example-01.mkv",
        parsed_title: "Example Show",
        source_path: "/imports/example-01.mkv",
      },
    ],
    selected_candidate_ids: [],
    selected_files: [],
  });

  assert.deepStrictEqual(result.selected_candidate_ids, [7]);
  assert.deepStrictEqual(result.selected_files[0]?.media_id, 7);
  assert.deepStrictEqual(result.selected_files[0]?.source_path, "/imports/example-01.mkv");
});

it("applyImportCandidateSelection deselects candidate owned files", () => {
  const result = applyImportCandidateSelection({
    candidate_id: brandMediaId(7),
    candidate_title: "Example Show",
    files: [
      {
        unit_number: 1,
        filename: "example-01.mkv",
        parsed_title: "Example Show",
        source_path: "/imports/example-01.mkv",
      },
    ],
    selected_candidate_ids: [brandMediaId(7)],
    selected_files: [
      {
        media_id: brandMediaId(7),
        unit_number: 1,
        source_path: "/imports/example-01.mkv",
      },
    ],
  });

  assert.deepStrictEqual(result.selected_candidate_ids, []);
  assert.deepStrictEqual(result.selected_files.length, 0);
});
