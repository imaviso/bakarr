import { describe, expect, it } from "vitest";
import { parseImportSearch } from "./-import-search";

describe("parseImportSearch", () => {
  it("accepts mediaId that was already decoded by the router", () => {
    expect(parseImportSearch({ mediaId: 42 }).mediaId).toBe(42);
  });

  it("accepts mediaId from the URL query string", () => {
    expect(parseImportSearch({ mediaId: "42" }).mediaId).toBe(42);
  });

  it("ignores invalid mediaId instead of throwing an error page", () => {
    expect(parseImportSearch({ mediaId: "1e3" }).mediaId).toBeUndefined();
    expect(parseImportSearch({ mediaId: "abc" }).mediaId).toBeUndefined();
  });
});
