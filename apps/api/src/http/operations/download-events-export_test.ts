import { assert, it } from "@effect/vitest";
import { buildDownloadExportHeaders } from "@/http/operations/downloads-router.ts";

it("download events export response adds export metadata headers", () => {
  const page = {
    events: [],
    exported: 3,
    generated_at: "2026-03-27T00:00:00.000Z",
    limit: 50,
    order: "desc" as const,
    total: 12,
    truncated: true,
  };

  const headers = buildDownloadExportHeaders(page);

  assert.deepStrictEqual(headers["X-Bakarr-Exported-Events"], "3");
  assert.deepStrictEqual(headers["X-Bakarr-Export-Limit"], "50");
  assert.deepStrictEqual(headers["X-Bakarr-Export-Order"], "desc");
  assert.deepStrictEqual(headers["X-Bakarr-Export-Truncated"], "true");
  assert.deepStrictEqual(headers["X-Bakarr-Generated-At"], "2026-03-27T00:00:00.000Z");
  assert.deepStrictEqual(headers["X-Bakarr-Total-Events"], "12");
});
