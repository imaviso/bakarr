import { beforeEach, vi } from "vitest";
import { it } from "~/test/vitest";

const toastState = vi.hoisted(() => ({
  errorCalls: [] as string[],
  successCalls: [] as string[],
}));

vi.mock("solid-sonner", () => ({
  toast: {
    error: (message: string) => {
      toastState.errorCalls.push(message);
    },
    success: (message: string) => {
      toastState.successCalls.push(message);
    },
  },
}));

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

beforeEach(() => {
  toastState.errorCalls = [];
  toastState.successCalls = [];
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
  await copyToClipboard("abc123", "API Key");

  assertEquals(writes.length, 1);
  assertEquals(writes[0], "abc123");
  assertEquals(toastState.successCalls[0], "API Key copied to clipboard");
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
  await copyToClipboard("naruto", "Title");

  assertEquals(appended.length, 1);
  assertEquals(removed.length, 1);
  assertEquals(toastState.successCalls[0], "Title copied to clipboard");
});
