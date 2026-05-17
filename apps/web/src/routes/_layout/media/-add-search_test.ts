import { describe, expect, it } from "vitest";
import { parseAddMediaSearch } from "./-add-search";

describe("parseAddMediaSearch", () => {
  it("accepts an id that was already decoded by the router", () => {
    expect(parseAddMediaSearch({ id: 137662 }).id).toBe(137662);
  });

  it("accepts an id from the URL query string", () => {
    expect(parseAddMediaSearch({ id: "137662" }).id).toBe(137662);
  });
});
