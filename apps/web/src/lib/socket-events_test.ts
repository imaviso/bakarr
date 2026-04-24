import { it } from "vitest";
import {
  createSocketConnection,
  setSharedSocketAuthenticated,
  subscribeSharedSocket,
  type SocketMessageListener,
} from "./socket-events";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function setWebSocketGlobal(value: unknown) {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value,
    writable: true,
  });
}

function isTimeoutCallback(callback: TimerHandler): callback is () => void {
  return typeof callback === "function";
}

class WebSocketStub {
  static instances: WebSocketStub[] = [];

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  closed = false;
  readyState = WebSocketStub.CONNECTING;

  constructor(public readonly url: string) {
    WebSocketStub.instances.push(this);
    this.readyState = WebSocketStub.OPEN;
  }

  addEventListener(type: string, listener: (...args: unknown[]) => void) {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }

  close() {
    this.closed = true;
    this.readyState = WebSocketStub.CLOSED;
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

const originalWebSocket = globalThis.WebSocket;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const noopSocketListener: SocketMessageListener = () => {};
const uniqueSocketListenerA: SocketMessageListener = () => {};
const uniqueSocketListenerB: SocketMessageListener = () => {};
const noopClearTimeout: typeof clearTimeout = () => {};

it("createSocketConnection connects only while authenticated", () => {
  WebSocketStub.instances = [];
  setWebSocketGlobal(WebSocketStub);

  const connection = createSocketConnection({
    isAuthenticated: () => false,
    onMessage: noopSocketListener,
  });

  connection.connect();
  assertEquals(WebSocketStub.instances.length, 0);

  let authenticated = true;
  const authenticatedConnection = createSocketConnection({
    isAuthenticated: () => authenticated,
    onMessage: noopSocketListener,
  });

  authenticatedConnection.connect();
  assertEquals(WebSocketStub.instances.length, 1);
  assertEquals(WebSocketStub.instances[0]?.url.includes("/api/events"), true);

  authenticated = false;
  authenticatedConnection.disconnect();
  assertEquals(WebSocketStub.instances[0]?.closed, true);

  setWebSocketGlobal(originalWebSocket);
});

it("createSocketConnection schedules reconnect after close", () => {
  WebSocketStub.instances = [];
  setWebSocketGlobal(WebSocketStub);

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
  const connection = createSocketConnection({
    isAuthenticated: () => true,
    onMessage: noopSocketListener,
    onError: () => {
      errorCount += 1;
    },
    reconnectDelayMs: 1234,
  });

  connection.connect();
  assertEquals(WebSocketStub.instances.length, 1);
  const first = WebSocketStub.instances[0];
  if (!first) {
    throw new Error("Expected an initial WebSocket instance");
  }

  first.emit("close", { type: "close" });
  assertEquals(errorCount, 1);
  assertEquals(scheduledCallbacks.length, 1);

  scheduledCallbacks[0]?.();
  assertEquals(WebSocketStub.instances.length, 2);

  connection.disconnect();

  setWebSocketGlobal(originalWebSocket);
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

it("shared socket hub uses a single WebSocket for subscribers", () => {
  WebSocketStub.instances = [];
  setWebSocketGlobal(WebSocketStub);

  const unsubscribeA = subscribeSharedSocket({ onMessage: uniqueSocketListenerA });
  const unsubscribeB = subscribeSharedSocket({ onMessage: uniqueSocketListenerB });

  setSharedSocketAuthenticated(true);

  assertEquals(WebSocketStub.instances.length, 1);

  unsubscribeA();
  assertEquals(WebSocketStub.instances[0]?.closed, false);

  unsubscribeB();
  assertEquals(WebSocketStub.instances[0]?.closed, true);

  setWebSocketGlobal(originalWebSocket);
});

it("shared socket hub decodes binary websocket frames", () => {
  WebSocketStub.instances = [];
  setWebSocketGlobal(WebSocketStub);

  const received: string[] = [];
  const unsubscribe = subscribeSharedSocket({
    onMessage: (event) => {
      received.push(event.data);
    },
  });

  setSharedSocketAuthenticated(true);

  const socket = WebSocketStub.instances[0];
  if (!socket) {
    throw new Error("Expected shared socket instance");
  }

  const encoded = new TextEncoder().encode('{"type":"Info","payload":{"message":"hello"}}');
  socket.emit("message", { data: encoded.buffer });

  assertEquals(received.length, 1);
  assertEquals(received[0], '{"type":"Info","payload":{"message":"hello"}}');

  unsubscribe();
  setWebSocketGlobal(originalWebSocket);
});

it("shared socket hub notifies subscriber error listeners on socket error", () => {
  WebSocketStub.instances = [];
  setWebSocketGlobal(WebSocketStub);

  let errorCount = 0;
  const unsubscribe = subscribeSharedSocket({
    onError: () => {
      errorCount += 1;
    },
    onMessage: uniqueSocketListenerA,
  });

  setSharedSocketAuthenticated(true);

  const socket = WebSocketStub.instances[0];
  if (!socket) {
    throw new Error("Expected shared socket instance");
  }

  socket.emit("error", { type: "error" });
  assertEquals(errorCount, 1);

  unsubscribe();
  setWebSocketGlobal(originalWebSocket);
});
