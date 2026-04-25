import { beforeEach, it } from "vitest";
import { Effect } from "effect";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: () => Promise.resolve(),
      },
    },
  });
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: true,
  });
});

it("cn merges classes deterministically", async () => {
  const { cn } = await import("./utils");
  assertEquals(cn("px-2", "px-4", undefined, "text-sm"), "px-4 text-sm");
});

it("copyToClipboard uses clipboard API", async () => {
  const writes: string[] = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: (text: string) => {
          writes.push(text);
          return Promise.resolve();
        },
      },
    },
  });

  const { copyToClipboard } = await import("./utils");
  await Effect.runPromise(copyToClipboard("abc123"));

  assertEquals(writes.length, 1);
  assertEquals(writes[0], "abc123");
});
