import { beforeEach } from "vitest";
import { it } from "~/test/vitest";

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

it("copyToClipboard uses clipboard API in secure context", async () => {
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
  const copied = await copyToClipboard("abc123");

  assertEquals(writes.length, 1);
  assertEquals(writes[0], "abc123");
  assertEquals(copied, true);
});

it("copyToClipboard uses fallback path when clipboard API is unavailable", async () => {
  const appended: unknown[] = [];
  const removed: unknown[] = [];
  const fakeTextArea = {
    setAttribute: () => {},
    focus: () => {},
    select: () => {},
    setSelectionRange: () => {},
    style: {
      left: "",
      opacity: "",
      pointerEvents: "",
      position: "",
      top: "",
      transform: "",
    },
    value: "",
  };

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: false,
  });

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        appendChild: (value: unknown) => {
          appended.push(value);
        },
        removeChild: (value: unknown) => {
          removed.push(value);
        },
      },
      createElement: () => fakeTextArea,
      execCommand: () => true,
    },
  });

  const { copyToClipboard } = await import("./utils");
  const copied = await copyToClipboard("naruto");

  assertEquals(appended.length, 1);
  assertEquals(removed.length, 1);
  assertEquals(copied, true);
});
