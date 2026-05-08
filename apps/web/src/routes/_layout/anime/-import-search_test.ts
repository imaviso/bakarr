import { describe, expect, it } from "vitest";
import { parseImportSearch } from "./-import-search";

describe("parseImportSearch", () => {
  it("accepts animeId that was already decoded by the router", () => {
    expect(parseImportSearch({ animeId: 42 }).animeId).toBe(42);
  });

  it("accepts animeId from the URL query string", () => {
    expect(parseImportSearch({ animeId: "42" }).animeId).toBe(42);
  });

  it("ignores invalid animeId instead of throwing an error page", () => {
    expect(parseImportSearch({ animeId: "1e3" }).animeId).toBeUndefined();
    expect(parseImportSearch({ animeId: "abc" }).animeId).toBeUndefined();
  });
});
