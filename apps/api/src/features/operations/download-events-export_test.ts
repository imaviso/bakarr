// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { assert, it } from "@effect/vitest";
import { buildExportHeaders } from "@/infra/http/export-responses.ts";

it("download events export response adds export metadata headers", () => {
  const page: {
    events: readonly unknown[];
    exported: number;
    generated_at: string;
    limit: number;
    order: "asc" | "desc";
    total: number;
    truncated: boolean;
  } = {
    events: [],
    exported: 3,
    generated_at: "2026-03-27T00:00:00.000Z",
    limit: 50,
    order: "desc",
    total: 12,
    truncated: true,
  };

  const headers = buildExportHeaders(page, "events");

  assert.deepStrictEqual(headers["X-Bakarr-Exported-Events"], "3");
  assert.deepStrictEqual(headers["X-Bakarr-Export-Limit"], "50");
  assert.deepStrictEqual(headers["X-Bakarr-Export-Order"], "desc");
  assert.deepStrictEqual(headers["X-Bakarr-Export-Truncated"], "true");
  assert.deepStrictEqual(headers["X-Bakarr-Generated-At"], "2026-03-27T00:00:00.000Z");
  assert.deepStrictEqual(headers["X-Bakarr-Total-Events"], "12");
});
