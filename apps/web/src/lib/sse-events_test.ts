import { it } from "~/test/vitest";
import {
  createSseConnection,
  setSharedSseAuthenticated,
  subscribeSharedSse,
  type SseListener,
} from "./sse-events";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function setEventSourceGlobal(value: unknown) {
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value,
    writable: true,
  });
}

function isTimeoutCallback(callback: TimerHandler): callback is () => void {
  return typeof callback === "function";
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
const noopSseListener: SseListener = () => {};
const uniqueSseListenerA: SseListener = () => {};
const uniqueSseListenerB: SseListener = () => {};
const noopClearTimeout: typeof clearTimeout = () => {};

it("createSseConnection connects only while authenticated", () => {
  EventSourceStub.instances = [];
  setEventSourceGlobal(EventSourceStub);

  const connection = createSseConnection({
    isAuthenticated: () => false,
    onMessage: noopSseListener,
  });

  connection.connect();
  assertEquals(EventSourceStub.instances.length, 0);

  let authenticated = true;
  const authenticatedConnection = createSseConnection({
    isAuthenticated: () => authenticated,
    onMessage: noopSseListener,
  });

  authenticatedConnection.connect();
  assertEquals(EventSourceStub.instances.length, 1);
  assertEquals(EventSourceStub.instances[0]?.url, "/api/events");

  authenticated = false;
  authenticatedConnection.disconnect();
  assertEquals(EventSourceStub.instances[0]?.closed, true);

  setEventSourceGlobal(originalEventSource);
});

it("createSseConnection schedules reconnect after error", () => {
  EventSourceStub.instances = [];
  setEventSourceGlobal(EventSourceStub);

  const scheduledCallbacks: Array<() => void> = [];
  let timeoutId = 0;
  const setTimeoutStub: typeof setTimeout = (callback) => {
    if (!isTimeoutCallback(callback)) {
      throw new Error("Expected function timeout callback");
    }

    scheduledCallbacks.push(callback);
    timeoutId += 1;
    return timeoutId;
  };
  globalThis.setTimeout = setTimeoutStub;
  globalThis.clearTimeout = noopClearTimeout;

  let errorCount = 0;
  const connection = createSseConnection({
    isAuthenticated: () => true,
    onMessage: noopSseListener,
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

  setEventSourceGlobal(originalEventSource);
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

it("shared SSE hub uses a single EventSource for subscribers", () => {
  EventSourceStub.instances = [];
  setEventSourceGlobal(EventSourceStub);

  const unsubscribeA = subscribeSharedSse({ onMessage: uniqueSseListenerA });
  const unsubscribeB = subscribeSharedSse({ onMessage: uniqueSseListenerB });

  setSharedSseAuthenticated(true);

  assertEquals(EventSourceStub.instances.length, 1);

  unsubscribeA();
  assertEquals(EventSourceStub.instances[0]?.closed, false);

  unsubscribeB();
  assertEquals(EventSourceStub.instances[0]?.closed, true);

  setEventSourceGlobal(originalEventSource);
});
