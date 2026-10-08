import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  buildDownloadImportEventMetadata,
  isStaleReconcileClaim,
} from "@/features/operations/download/download-import-meta.ts";

it.effect("import envelope carries covered units, source, and path", () =>
  Effect.gen(function* () {
    const encoded = yield* buildDownloadImportEventMetadata({
      coveredUnitsJson: "[1,2]",
      importedPath: "/library/Show",
      sourceMetadata: {
        decision_reason: "manual",
        source_identity: { scheme: "season", season: 1, unit_numbers: [1], label: "S01E01" },
      },
    });
    assert.deepStrictEqual(JSON.parse(encoded), {
      covered_units: [1, 2],
      imported_path: "/library/Show",
      source_metadata: {
        decision_reason: "manual",
        source_identity: { scheme: "season", season: 1, unit_numbers: [1], label: "S01E01" },
      },
    });
  }),
);

it("stale claims release, fresh claims hold", () => {
  assert.deepStrictEqual(
    isStaleReconcileClaim("2026-01-01T00:00:00.000Z", "2026-01-01T00:31:00.000Z"),
    true,
  );
  assert.deepStrictEqual(
    isStaleReconcileClaim("2026-01-01T00:00:00.000Z", "2026-01-01T00:05:00.000Z"),
    false,
  );
  assert.deepStrictEqual(isStaleReconcileClaim(null, "2026-01-01T00:05:00.000Z"), true);
  assert.deepStrictEqual(
    isStaleReconcileClaim("not-a-timestamp", "2026-01-01T00:05:00.000Z"),
    true,
  );
});
