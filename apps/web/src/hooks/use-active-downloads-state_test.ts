import { it } from "~/test/vitest";
import { parseDownloadProgressFromSocketMessage } from "./use-active-downloads-state";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

it("parseDownloadProgressFromSocketMessage returns downloads for DownloadProgress", () => {
  const result = parseDownloadProgressFromSocketMessage(
    JSON.stringify({
      type: "DownloadProgress",
      payload: {
        downloads: [
          {
            downloaded_bytes: 120,
            eta: 10,
            hash: "abc",
            name: "Show - 01",
            progress: 12,
            speed: 1024,
            state: "downloading",
            total_bytes: 1000,
          },
        ],
      },
    }),
  );

  assertEquals(result?.length, 1);
  assertEquals(result?.[0]?.hash, "abc");
});

it("parseDownloadProgressFromSocketMessage returns undefined for unrelated events", () => {
  const result = parseDownloadProgressFromSocketMessage(
    JSON.stringify({ type: "ScanStarted", payload: { path: "/library" } }),
  );

  assertEquals(result, undefined);
});

it("parseDownloadProgressFromSocketMessage returns undefined for malformed payloads", () => {
  const result = parseDownloadProgressFromSocketMessage("not-json");
  assertEquals(result, undefined);
});
