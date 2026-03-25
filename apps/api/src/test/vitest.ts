import { describe, expect, it } from "@effect/vitest";

export { describe, expect, it };

export function assert(value: unknown, message?: string): asserts value {
  expect(value, message).toBeTruthy();
}

export function assertEquals<A>(
  actual: A,
  expected: A,
  message?: string,
) {
  expect(actual, message).toEqual(expected);
}

export function assertExists<A>(
  value: A,
  message?: string,
): asserts value is NonNullable<A> {
  expect(value, message).not.toBeUndefined();
  expect(value, message).not.toBeNull();
}

export function assertInstanceOf<A>(
  value: unknown,
  constructor: new (...args: Array<any>) => A,
  message?: string,
): asserts value is A {
  expect(value, message).toBeInstanceOf(constructor);
}

export function assertMatch(
  actual: string,
  expected: RegExp,
  message?: string,
) {
  expect(actual, message).toMatch(expected);
}

export function assertNotEquals<A>(
  actual: A,
  expected: A,
  message?: string,
) {
  expect(actual, message).not.toEqual(expected);
}

export async function assertRejects(
  fn: () => PromiseLike<unknown>,
  errorClass?: new (...args: Array<any>) => Error,
  msgIncludes?: string | RegExp,
  message?: string,
) {
  const promise = Promise.resolve().then(fn);

  if (errorClass) {
    await expect(promise, message).rejects.toBeInstanceOf(errorClass);
  } else {
    await expect(promise, message).rejects.toThrow();
  }

  if (msgIncludes !== undefined) {
    await expect(promise, message).rejects.toThrow(msgIncludes);
  }
}

export function assertThrows(
  fn: () => unknown,
  errorClass?: new (...args: Array<any>) => Error,
  msgIncludes?: string | RegExp,
  message?: string,
) {
  if (errorClass) {
    expect(fn, message).toThrow(errorClass);
  } else {
    expect(fn, message).toThrow();
  }

  if (msgIncludes !== undefined) {
    expect(fn, message).toThrow(msgIncludes);
  }
}
