export type SseListener = (event: MessageEvent<string>) => void;

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
