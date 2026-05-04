import { assert, it } from "@effect/vitest";

import {
  DEFAULT_IMPORT_SCAN_LIMIT,
  MAX_IMPORT_SCAN_LIMIT,
  resolveImportScanLimit,
} from "@/features/operations/import-path-scan-policy.ts";

it("resolveImportScanLimit defaults missing values and clamps bounds", () => {
  assert.deepStrictEqual(resolveImportScanLimit(undefined), DEFAULT_IMPORT_SCAN_LIMIT);
  assert.deepStrictEqual(resolveImportScanLimit(0), 1);
  assert.deepStrictEqual(resolveImportScanLimit(-100), 1);
  assert.deepStrictEqual(resolveImportScanLimit(42), 42);
  assert.deepStrictEqual(resolveImportScanLimit(MAX_IMPORT_SCAN_LIMIT + 1), MAX_IMPORT_SCAN_LIMIT);
});
