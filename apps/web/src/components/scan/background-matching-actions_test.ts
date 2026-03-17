/// <reference lib="deno.ns" />

import {
  runBulkBackgroundMatchAction,
  runFolderBackgroundMatchAction,
} from "./background-matching-actions.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assertArrayEquals<T>(actual: T[], expected: T[]) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

Deno.test("folder resume starts a background pass after control update", async () => {
  const calls: string[] = [];

  await runFolderBackgroundMatchAction({
    action: "resume",
    control: () => {
      calls.push("control");
      return Promise.resolve();
    },
    path: "/library/Example",
    startScan: () => {
      calls.push("scan");
      return Promise.resolve();
    },
  });

  assertArrayEquals(calls, ["control", "scan"]);
});

Deno.test("folder refresh does not start a full background pass", async () => {
  const calls: string[] = [];

  await runFolderBackgroundMatchAction({
    action: "refresh",
    control: () => {
      calls.push("control");
      return Promise.resolve();
    },
    path: "/library/Example",
    startScan: () => {
      calls.push("scan");
      return Promise.resolve();
    },
  });

  assertArrayEquals(calls, ["control"]);
});

Deno.test("bulk resume starts a background pass after queuing folders", async () => {
  const calls: string[] = [];

  await runBulkBackgroundMatchAction({
    action: "resume_paused",
    control: () => {
      calls.push("control");
      return Promise.resolve();
    },
    startScan: () => {
      calls.push("scan");
      return Promise.resolve();
    },
  });

  assertArrayEquals(calls, ["control", "scan"]);
});

Deno.test("bulk pause does not start a background pass", async () => {
  const calls: string[] = [];

  await runBulkBackgroundMatchAction({
    action: "pause_queued",
    control: () => {
      calls.push("control");
      return Promise.resolve();
    },
    startScan: () => {
      calls.push("scan");
      return Promise.resolve();
    },
  });

  assertArrayEquals(calls, ["control"]);
});

Deno.test("scan is not started when control action fails", async () => {
  let started = false;
  let message = "";

  try {
    await runBulkBackgroundMatchAction({
      action: "retry_failed",
      control: () => {
        return Promise.reject(new Error("control failed"));
      },
      startScan: () => {
        started = true;
        return Promise.resolve();
      },
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assertEquals(message, "control failed");
  assertEquals(started, false);
});
