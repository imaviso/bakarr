import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { decodeNotificationEventWire } from "@bakarr/shared";
import { getAuthState } from "~/app/auth-state";
import { handleSocketEvent } from "~/infra/socket-event-handler";

const RECONNECT_DELAY_MS = 5000;
const UNAUTHENTICATED_POLL_MS = 1000;

function buildWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/events`;
}

function decodeSocketPayload(data: unknown, textDecoder: TextDecoder): string | undefined {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return textDecoder.decode(new Uint8Array(data));
  }

  return undefined;
}

export function useSocketEvents() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textDecoderRef = useRef<TextDecoder | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => getAuthState().isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      // No session yet: poll auth state so a login reconnects.
      const interval = setInterval(() => {
        if (getAuthState().isAuthenticated) {
          setIsAuthenticated(true);
        }
      }, UNAUTHENTICATED_POLL_MS);
      return () => clearInterval(interval);
    }

    const socket = new WebSocket(buildWsUrl());
    socket.binaryType = "arraybuffer";
    if (textDecoderRef.current === null) {
      textDecoderRef.current = new TextDecoder();
    }
    socketRef.current = socket;

    const onMessage = (event: MessageEvent) => {
      const payload = decodeSocketPayload(event.data, textDecoderRef.current!);
      if (payload === undefined) {
        return;
      }

      const decoded = decodeNotificationEventWire(payload);
      if (decoded._tag === "Right") {
        handleSocketEvent(queryClient, decoded.right);
      }
    };

    let disconnected = false;
    const onDisconnect = () => {
      if (disconnected) {
        return;
      }

      disconnected = true;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      reconnectTimerRef.current = setTimeout(
        () => setIsAuthenticated(getAuthState().isAuthenticated),
        RECONNECT_DELAY_MS,
      );
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onDisconnect);
    socket.addEventListener("error", () => {
      onDisconnect();
      socket.close();
    });

    return () => {
      disconnected = true;
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onDisconnect);
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [isAuthenticated, queryClient]);
}
