import { expect, it } from "vitest";

export { it };

export function assertEquals<A>(actual: A, expected: A, message?: string) {
  expect(actual, message).toEqual(expected);
}

export function assertMatch(actual: string, expected: RegExp, message?: string) {
  expect(actual, message).toMatch(expected);
}
