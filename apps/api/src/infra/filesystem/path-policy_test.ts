import { assert, it } from "@effect/vitest";

import { sanitizeFilename, truncateFilenameToByteLimit } from "@/infra/filesystem/path-policy.ts";

it("sanitizeFilename replaces filesystem-unsafe characters with spaces", () => {
  assert.deepStrictEqual(sanitizeFilename("Show/Name"), "Show Name");
  assert.deepStrictEqual(sanitizeFilename("Show:Name"), "Show Name");
  assert.deepStrictEqual(sanitizeFilename("Show\\Name"), "Show Name");
});

it("sanitizeFilename removes restricted characters", () => {
  assert.deepStrictEqual(sanitizeFilename("Show*Name"), "ShowName");
  assert.deepStrictEqual(sanitizeFilename('Show"Name'), "ShowName");
  assert.deepStrictEqual(sanitizeFilename("Show?Name"), "ShowName");
  assert.deepStrictEqual(sanitizeFilename("Show<Name"), "ShowName");
  assert.deepStrictEqual(sanitizeFilename("Show>Name"), "ShowName");
  assert.deepStrictEqual(sanitizeFilename("Show|Name"), "ShowName");
});

it("sanitizeFilename collapses multiple spaces and trims", () => {
  assert.deepStrictEqual(sanitizeFilename("  Show :  Name / Extra  "), "Show Name Extra");
});

it("sanitizeFilename preserves safe characters", () => {
  assert.deepStrictEqual(sanitizeFilename("Show-Name_2025"), "Show-Name_2025");
  assert.deepStrictEqual(sanitizeFilename("Re:Zero"), "Re Zero");
});

it("sanitizeFilename caps the rendered name under the 255-byte component limit", () => {
  const longTitle = "S".repeat(400);
  const cleaned = sanitizeFilename(longTitle);
  assert.deepStrictEqual(Buffer.byteLength(cleaned, "utf8") <= 210, true);
});

it("truncateFilenameToByteLimit leaves room for the file extension", () => {
  const longTitle = "S".repeat(300);
  const base = truncateFilenameToByteLimit(longTitle, 210 - 4);
  const full = `${base}.mkv`;
  assert.deepStrictEqual(Buffer.byteLength(full, "utf8") <= 210, true);
  assert.deepStrictEqual(full.endsWith(".mkv"), true);
});

it("truncateFilenameToByteLimit keeps multi-byte characters intact", () => {
  const emojiName = "アニメタイトル".repeat(40);
  const truncated = truncateFilenameToByteLimit(emojiName, 240);
  assert.deepStrictEqual(Buffer.byteLength(truncated, "utf8") <= 240, true);
  // No replacement characters from split code points.
  assert.deepStrictEqual(truncated.includes("\uFFFD"), false);
});

it("truncateFilenameToByteLimit leaves short names untouched", () => {
  assert.deepStrictEqual(truncateFilenameToByteLimit("Show - S01E05", 210), "Show - S01E05");
});
