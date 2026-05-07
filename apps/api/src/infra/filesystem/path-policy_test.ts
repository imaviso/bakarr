import { assert, it } from "@effect/vitest";

import { sanitizeFilename } from "@/infra/filesystem/path-policy.ts";

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
