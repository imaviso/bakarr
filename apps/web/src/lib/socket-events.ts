export type SocketMessageListener = (event: MessageEvent<string>) => void;

const sharedListeners = new Set<SocketMessageListener>();
const sharedErrorListeners = new Set<() => void>();
let sharedSocket: WebSocket | null = null;
let sharedReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let sharedIsAuthenticated = false;

const SHARED_RECONNECT_DELAY_MS = 5000;

function clearSharedReconnectTimeout() {
  if (!sharedReconnectTimeout) {
    return;
  }

  clearTimeout(sharedReconnectTimeout);
  sharedReconnectTimeout = null;
}

function disconnectSharedSocket() {
  if (sharedSocket) {
    sharedSocket.close();
    sharedSocket = null;
  }

  clearSharedReconnectTimeout();
}

function shouldConnectSharedSocket() {
  return sharedIsAuthenticated && sharedListeners.size > 0;
}

function dispatchSharedError() {
  for (const listener of sharedErrorListeners) {
    listener();
  }
}

function dispatchSharedMessage(event: MessageEvent<string>) {
  for (const listener of sharedListeners) {
    listener(event);
  }
}

function scheduleSharedReconnect(delay: number) {
  if (sharedReconnectTimeout || !shouldConnectSharedSocket()) {
    return;
  }

  sharedReconnectTimeout = setTimeout(() => {
    sharedReconnectTimeout = null;
    connectSharedSocket();
  }, delay);
}

function connectSharedSocket() {
  if (!shouldConnectSharedSocket()) {
    disconnectSharedSocket();
    return;
  }

  if (
    sharedSocket &&
    (sharedSocket.readyState === WebSocket.CONNECTING || sharedSocket.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  const socket = connectWebSocket(
    dispatchSharedMessage,
    () => {
      dispatchSharedError();
    },
    () => {
      if (sharedSocket !== socket) {
        return;
      }

      sharedSocket = null;

      dispatchSharedError();
      scheduleSharedReconnect(SHARED_RECONNECT_DELAY_MS);
    },
  );

  sharedSocket = socket;
}

export function setSharedSocketAuthenticated(isAuthenticated: boolean) {
  sharedIsAuthenticated = isAuthenticated;

  if (!shouldConnectSharedSocket()) {
    disconnectSharedSocket();
    return;
  }

  connectSharedSocket();
}

export function subscribeSharedSocket(options: {
  onMessage: SocketMessageListener;
  onError?: () => void;
}) {
  sharedListeners.add(options.onMessage);

  if (options.onError) {
    sharedErrorListeners.add(options.onError);
  }

  connectSharedSocket();

  return () => {
    sharedListeners.delete(options.onMessage);

    if (options.onError) {
      sharedErrorListeners.delete(options.onError);
    }

    if (!shouldConnectSharedSocket()) {
      disconnectSharedSocket();
    }
  };
}

function buildWebSocketUrl() {
  const location = globalThis.location;
  if (!location) {
    return "ws://localhost/api/events";
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/events`;
}

function toMessageEvent(data: string): MessageEvent<string> {
  return new MessageEvent<string>("message", { data });
}

function connectWebSocket(
  onEvent: SocketMessageListener,
  onError: () => void,
  onClose: () => void,
): WebSocket {
  const textDecoder = new TextDecoder();
  const socket = new WebSocket(buildWebSocketUrl());
  socket.binaryType = "arraybuffer";
  socket.addEventListener("message", (event) => {
    const payload =
      typeof event.data === "string"
        ? event.data
        : event.data instanceof ArrayBuffer
          ? textDecoder.decode(new Uint8Array(event.data))
          : undefined;

    if (payload === undefined) {
      return;
    }

    onEvent(toMessageEvent(payload));
  });
  socket.addEventListener("close", onClose);
  socket.addEventListener("error", onError);
  return socket;
}

export function createSocketConnection(options: {
  isAuthenticated: () => boolean;
  onMessage: SocketMessageListener;
  onError?: () => void;
  reconnectDelayMs?: number;
}) {
  const reconnectDelay = options.reconnectDelayMs ?? 5000;
  let socket: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearReconnectTimeout = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  const disconnect = () => {
    if (socket) {
      socket.close();
      socket = null;
    }
    clearReconnectTimeout();
  };

  const scheduleReconnect = () => {
    if (reconnectTimeout || !options.isAuthenticated()) {
      return;
    }

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, reconnectDelay);
  };

  const handleError = () => {
    options.onError?.();
  };

  const handleClose = () => {
    socket = null;
    options.onError?.();
    scheduleReconnect();
  };

  const connect = () => {
    disconnect();
    if (!options.isAuthenticated()) {
      return;
    }
    socket = connectWebSocket(options.onMessage, handleError, handleClose);
  };

  return {
    connect,
    disconnect,
  };
}
