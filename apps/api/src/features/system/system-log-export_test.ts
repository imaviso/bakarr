import { assert, it } from "@effect/vitest";
import { brandSystemLogId } from "@packages/shared/index.ts";

import {
  buildSystemLogConditions,
  buildSystemLogExportPlan,
  toSystemLog,
} from "@/features/system/system-log-export.ts";

it("buildSystemLogConditions returns empty when no filters", () => {
  assert.deepStrictEqual(buildSystemLogConditions({}), []);
});

it("buildSystemLogConditions includes level filter", () => {
  const result = buildSystemLogConditions({ level: "error" });
  assert.deepStrictEqual(result.length, 1);
});

it("buildSystemLogConditions includes all filters", () => {
  const result = buildSystemLogConditions({
    endDate: "2025-06-01",
    eventType: "Scan",
    level: "warn",
    startDate: "2025-01-01",
  });
  assert.deepStrictEqual(result.length, 4);
});

it("buildSystemLogExportPlan embeds conditions and default limit", () => {
  const plan = buildSystemLogExportPlan({ level: "error" });
  assert.deepStrictEqual(plan.limit, 10000);
  assert.deepStrictEqual(plan.conditions.length, 1);
});

it("toSystemLog normalizes level and maps db row to frontend shape", () => {
  const log = toSystemLog({
    createdAt: "2025-06-01T00:00:00.000Z",
    details: "extra info",
    eventType: "auth.login",
    id: brandSystemLogId(42),
    level: "debug",
    message: "user logged in",
  });
  assert.deepStrictEqual(log, {
    created_at: "2025-06-01T00:00:00.000Z",
    details: "extra info",
    event_type: "auth.login",
    id: brandSystemLogId(42),
    level: "info",
    message: "user logged in",
  });
});

it("toSystemLog omits null details", () => {
  const log = toSystemLog({
    createdAt: "2025-01-01T00:00:00.000Z",
    details: null,
    eventType: "system.startup",
    id: 1,
    level: "info",
    message: "started",
  });
  assert.deepStrictEqual(log.details, undefined);
});
