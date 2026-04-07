import { it } from "~/test/vitest";
import { createSseConnection, type SseListener } from "./sse-events";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

class EventSourceStub {
  static instances: EventSourceStub[] = [];

  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  closed = false;

  constructor(public readonly url: string) {
    EventSourceStub.instances.push(this);
  }

  addEventListener(type: string, listener: (...args: unknown[]) => void) {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: unknown) {
    const current = this.listeners.get(type);
    if (!current) {
      return;
    }

    for (const listener of current) {
      listener(event);
    }
  }
}

const originalEventSource = globalThis.EventSource;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

it("createSseConnection connects only while authenticated", () => {
  EventSourceStub.instances = [];
  globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

  const connection = createSseConnection({
    isAuthenticated: () => false,
    onMessage: (() => {}) as SseListener,
  });

  connection.connect();
  assertEquals(EventSourceStub.instances.length, 0);

  let authenticated = true;
  const authenticatedConnection = createSseConnection({
    isAuthenticated: () => authenticated,
    onMessage: (() => {}) as SseListener,
  });

  authenticatedConnection.connect();
  assertEquals(EventSourceStub.instances.length, 1);
  assertEquals(EventSourceStub.instances[0]?.url, "/api/events");

  authenticated = false;
  authenticatedConnection.disconnect();
  assertEquals(EventSourceStub.instances[0]?.closed, true);

  globalThis.EventSource = originalEventSource;
});

it("createSseConnection schedules reconnect after error", () => {
  EventSourceStub.instances = [];
  globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;

  const scheduledCallbacks: Array<() => void> = [];
  let timeoutId = 0;
  globalThis.setTimeout = ((callback: TimerHandler) => {
    if (typeof callback !== "function") {
      throw new Error("Expected function timeout callback");
    }

    scheduledCallbacks.push(callback as () => void);
    timeoutId += 1;
    return timeoutId as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

  let errorCount = 0;
  const connection = createSseConnection({
    isAuthenticated: () => true,
    onMessage: (() => {}) as SseListener,
    onError: () => {
      errorCount += 1;
    },
    reconnectDelayMs: 1234,
  });

  connection.connect();
  assertEquals(EventSourceStub.instances.length, 1);
  const first = EventSourceStub.instances[0];
  if (!first) {
    throw new Error("Expected an initial EventSource instance");
  }

  first.emit("error", { type: "error" });
  assertEquals(errorCount, 1);
  assertEquals(scheduledCallbacks.length, 1);

  scheduledCallbacks[0]?.();
  assertEquals(EventSourceStub.instances.length, 2);

  connection.disconnect();

  globalThis.EventSource = originalEventSource;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});
