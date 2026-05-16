import type { OperationTask } from "./contracts";
import { describe, expect, it } from "vitest";
import { brandOperationTaskId } from "@bakarr/shared";
import { isTaskActive, operationTaskPollInterval } from "./operations-tasks";

function task(status: OperationTask["status"]): OperationTask {
  return {
    created_at: "2026-01-01T00:00:00Z",
    id: brandOperationTaskId(1),
    status,
    task_key: "unmapped_scan_manual",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("operation task polling", () => {
  it.each(["queued", "running"] as const)("treats %s tasks as active", (status) => {
    expect(isTaskActive(task(status))).toBe(true);
    expect(operationTaskPollInterval(task(status))).toBe(1000);
  });

  it.each(["succeeded", "failed"] as const)("does not poll terminal %s tasks", (status) => {
    expect(isTaskActive(task(status))).toBe(false);
    expect(operationTaskPollInterval(task(status))).toBe(false);
  });

  it("does not poll missing tasks", () => {
    expect(operationTaskPollInterval(undefined)).toBe(false);
  });
});
