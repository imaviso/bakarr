import { describe, expect, it } from "vitest";
import { parseAddAnimeSearch } from "./-add-search";

describe("parseAddAnimeSearch", () => {
  it("accepts an id that was already decoded by the router", () => {
    expect(parseAddAnimeSearch({ id: 137662 }).id).toBe(137662);
  });

  it("accepts an id from the URL query string", () => {
    expect(parseAddAnimeSearch({ id: "137662" }).id).toBe(137662);
  });
});
