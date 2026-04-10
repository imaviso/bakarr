export type SseListener = (event: MessageEvent<string>) => void;

const sharedListeners = new Set<SseListener>();
const sharedErrorListeners = new Set<() => void>();
let sharedSource: EventSource | null = null;
let sharedReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let sharedIsAuthenticated = false;

function clearSharedReconnectTimeout() {
  if (!sharedReconnectTimeout) {
    return;
  }

  clearTimeout(sharedReconnectTimeout);
  sharedReconnectTimeout = null;
}

function disconnectSharedSource() {
  if (sharedSource) {
    sharedSource.close();
    sharedSource = null;
  }

  clearSharedReconnectTimeout();
}

function shouldConnectSharedSource() {
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
  if (sharedReconnectTimeout || !shouldConnectSharedSource()) {
    return;
  }

  sharedReconnectTimeout = setTimeout(() => {
    sharedReconnectTimeout = null;
    connectSharedSource(delay);
  }, delay);
}

function connectSharedSource(reconnectDelayMs = 5000) {
  if (!shouldConnectSharedSource()) {
    disconnectSharedSource();
    return;
  }

  if (sharedSource) {
    return;
  }

  sharedSource = connectEventSource(dispatchSharedMessage, () => {
    if (sharedSource) {
      sharedSource.close();
      sharedSource = null;
    }

    dispatchSharedError();
    scheduleSharedReconnect(reconnectDelayMs);
  });
}

export function setSharedSseAuthenticated(isAuthenticated: boolean) {
  sharedIsAuthenticated = isAuthenticated;

  if (!shouldConnectSharedSource()) {
    disconnectSharedSource();
    return;
  }

  connectSharedSource();
}

export function subscribeSharedSse(options: {
  onMessage: SseListener;
  onError?: () => void;
  reconnectDelayMs?: number;
}) {
  sharedListeners.add(options.onMessage);

  if (options.onError) {
    sharedErrorListeners.add(options.onError);
  }

  connectSharedSource(options.reconnectDelayMs);

  return () => {
    sharedListeners.delete(options.onMessage);

    if (options.onError) {
      sharedErrorListeners.delete(options.onError);
    }

    if (!shouldConnectSharedSource()) {
      disconnectSharedSource();
    }
  };
}

function connectEventSource(onEvent: SseListener, onError: () => void): EventSource {
  const source = new EventSource("/api/events");
  source.addEventListener("message", onEvent);
  source.addEventListener("error", onError);
  return source;
}

export function createSseConnection(options: {
  isAuthenticated: () => boolean;
  onMessage: SseListener;
  onError?: () => void;
  reconnectDelayMs?: number;
}) {
  const reconnectDelay = options.reconnectDelayMs ?? 5000;
  let source: EventSource | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearReconnectTimeout = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  const disconnect = () => {
    if (source) {
      source.close();
      source = null;
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
    source?.close();
    source = null;
    options.onError?.();
    scheduleReconnect();
  };

  const connect = () => {
    disconnect();
    if (!options.isAuthenticated()) {
      return;
    }
    source = connectEventSource(options.onMessage, handleError);
  };

  return {
    connect,
    disconnect,
  };
}
