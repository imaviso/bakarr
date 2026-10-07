import { assert, it } from "@effect/vitest";
import { brandMediaId } from "@packages/shared/index.ts";

import {
  applyImportCandidateSelection,
  buildInitialImportSelection,
  selectAllImportFiles,
  setImportFileMappingSelection,
  setImportFileMediaSelection,
  toggleImportFileSelection,
} from "@/features/operations/import-scan/import-selection-support.ts";

function scannedFile(
  overrides: Partial<Parameters<typeof buildInitialImportSelection>[0][number]> & {
    source_path: string;
  },
) {
  return {
    filename: overrides.source_path.split("/").pop() ?? "file.mkv",
    parsed_title: "Example Show",
    unit_number: 1,
    ...overrides,
  };
}

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
        suggested_candidate_id: brandMediaId(7),
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

it("applyImportCandidateSelection does not steal files suggested for another candidate", () => {
  const files = [
    scannedFile({
      source_path: "/imports/a-01.mkv",
      suggested_candidate_id: brandMediaId(7),
    }),
    scannedFile({
      source_path: "/imports/b-01.mkv",
      suggested_candidate_id: brandMediaId(8),
    }),
  ];

  const result = applyImportCandidateSelection({
    candidate_id: brandMediaId(7),
    candidate_title: "Show A",
    files,
    selected_candidate_ids: [],
    selected_files: [],
  });

  assert.deepStrictEqual(result.selected_candidate_ids, [7]);
  assert.deepStrictEqual(
    result.selected_files.map((file) => file.source_path),
    ["/imports/a-01.mkv"],
  );
});

it("applyImportCandidateSelection with force select assigns unaffiliated files", () => {
  const files = [
    scannedFile({ source_path: "/imports/a-01.mkv" }),
    scannedFile({
      source_path: "/imports/b-01.mkv",
      suggested_candidate_id: brandMediaId(8),
    }),
  ];

  const result = applyImportCandidateSelection({
    candidate_id: brandMediaId(7),
    candidate_title: "Show A",
    force_select: true,
    files,
    selected_candidate_ids: [],
    selected_files: [],
  });

  assert.deepStrictEqual(
    result.selected_files.map((file) => file.source_path),
    ["/imports/a-01.mkv"],
  );
});

it("applyImportCandidateSelection skips files without usable episode numbers", () => {
  const result = applyImportCandidateSelection({
    candidate_id: brandMediaId(7),
    candidate_title: "Example Show",
    files: [
      {
        unit_number: 0,
        filename: "example-unknown.mkv",
        parsed_title: "Example Show",
        source_path: "/imports/example-unknown.mkv",
        suggested_candidate_id: brandMediaId(7),
      },
    ],
    selected_candidate_ids: [],
    selected_files: [],
  });

  assert.deepStrictEqual(result.selected_candidate_ids, [7]);
  assert.deepStrictEqual(result.selected_files.length, 0);
});

it("buildInitialImportSelection preselects matched and suggested files", () => {
  const result = buildInitialImportSelection([
    scannedFile({
      source_path: "/imports/a-01.mkv",
      matched_media: { id: brandMediaId(7), title: "Show A" },
      suggested_candidate_id: brandMediaId(7),
    }),
    scannedFile({
      source_path: "/imports/b-01.mkv",
      suggested_candidate_id: brandMediaId(8),
    }),
    scannedFile({ source_path: "/imports/c-01.mkv" }),
    scannedFile({
      source_path: "/imports/d-00.mkv",
      suggested_candidate_id: brandMediaId(8),
      unit_number: 0,
    }),
  ]);

  assert.deepStrictEqual([...result.selected_candidate_ids].toSorted(), [7, 8]);
  assert.deepStrictEqual(result.selected_files.map((file) => file.source_path).toSorted(), [
    "/imports/a-01.mkv",
    "/imports/b-01.mkv",
  ]);
});

it("toggleImportFileSelection assigns the file affinity when no media is given", () => {
  const files = [
    scannedFile({
      source_path: "/imports/a-01.mkv",
      suggested_candidate_id: brandMediaId(7),
    }),
  ];

  const selected = toggleImportFileSelection({
    files,
    selected_candidate_ids: [],
    selected_files: [],
    source_path: "/imports/a-01.mkv",
  });

  assert.deepStrictEqual(selected.selected_files.length, 1);

  const deselected = toggleImportFileSelection({
    files,
    selected_candidate_ids: selected.selected_candidate_ids,
    selected_files: selected.selected_files,
    source_path: "/imports/a-01.mkv",
  });

  assert.deepStrictEqual(deselected.selected_files.length, 0);
  assert.deepStrictEqual(deselected.selected_candidate_ids, []);
});

it("setImportFileMediaSelection keeps the existing episode override", () => {
  const files = [
    scannedFile({
      source_path: "/imports/a-01.mkv",
      suggested_candidate_id: brandMediaId(7),
    }),
  ];

  const result = setImportFileMediaSelection({
    files,
    selected_candidate_ids: [brandMediaId(7)],
    selected_files: [
      {
        media_id: brandMediaId(7),
        unit_number: 4,
        season: 2,
        source_path: "/imports/a-01.mkv",
      },
    ],
    source_path: "/imports/a-01.mkv",
    media_id: brandMediaId(8),
  });

  assert.deepStrictEqual(result.selected_files[0]?.media_id, 8);
  assert.deepStrictEqual(result.selected_files[0]?.unit_number, 4);
  assert.deepStrictEqual(result.selected_files[0]?.season, 2);
});

it("setImportFileMappingSelection selects an unselected file with its affinity", () => {
  const files = [
    scannedFile({
      source_path: "/imports/a-01.mkv",
      suggested_candidate_id: brandMediaId(7),
    }),
  ];

  const result = setImportFileMappingSelection({
    files,
    selected_candidate_ids: [],
    selected_files: [],
    source_path: "/imports/a-01.mkv",
    season: 2,
    unit_number: 5,
  });

  assert.deepStrictEqual(result.selected_files[0]?.media_id, 7);
  assert.deepStrictEqual(result.selected_files[0]?.unit_number, 5);
  assert.deepStrictEqual(result.selected_files[0]?.season, 2);
});

it("selectAllImportFiles skips unaffiliated and unusable files", () => {
  const result = selectAllImportFiles({
    files: [
      scannedFile({
        source_path: "/imports/a-01.mkv",
        suggested_candidate_id: brandMediaId(7),
      }),
      scannedFile({ source_path: "/imports/b-01.mkv" }),
      scannedFile({
        source_path: "/imports/c-00.mkv",
        suggested_candidate_id: brandMediaId(7),
        unit_number: 0,
      }),
    ],
  });

  assert.deepStrictEqual(result.selected_candidate_ids, [7]);
  assert.deepStrictEqual(
    result.selected_files.map((file) => file.source_path),
    ["/imports/a-01.mkv"],
  );
});
