import { getAuthState } from "~/lib/auth-state";

const listeners = new Set<(event: MessageEvent<string>) => void>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(delay: number): void {
  if (listeners.size === 0 || reconnectTimer !== null) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function buildWsUrl(): string {
  if (typeof window === "undefined" || !window.location) {
    return "ws://localhost/api/events";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/events`;
}

function connect(): void {
  if (ws !== null || reconnectTimer !== null) {
    return;
  }

  const state = getAuthState();
  if (!state.isAuthenticated) {
    scheduleReconnect(1000);
    return;
  }

  const socket = new WebSocket(buildWsUrl());
  ws = socket;
  socket.binaryType = "arraybuffer";
  const textDecoder = new TextDecoder();

  socket.addEventListener("message", (event) => {
    const payload =
      typeof event.data === "string"
        ? event.data
        : event.data instanceof ArrayBuffer
          ? textDecoder.decode(new Uint8Array(event.data))
          : undefined;

    if (payload !== undefined) {
      const messageEvent = new MessageEvent<string>("message", { data: payload });
      for (const listener of listeners) {
        listener(messageEvent);
      }
    }
  });

  let disconnected = false;
  const onDisconnect = () => {
    if (disconnected) {
      return;
    }

    disconnected = true;
    if (ws === socket) {
      ws = null;
    }
    scheduleReconnect(5000);
  };

  socket.addEventListener("close", onDisconnect);
  socket.addEventListener("error", () => {
    onDisconnect();
    socket.close();
  });
}

export function subscribeSocketMessages(
  onMessage: (event: MessageEvent<string>) => void,
): () => void {
  listeners.add(onMessage);
  connect();

  return () => {
    listeners.delete(onMessage);
    if (listeners.size === 0) {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws !== null) {
        const socket = ws;
        ws = null;
        socket.close();
      }
    }
  };
}
