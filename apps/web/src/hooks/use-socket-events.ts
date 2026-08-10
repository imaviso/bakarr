import { useEffect, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { decodeNotificationEventWire } from "@bakarr/shared";
import { useAuth } from "~/app/auth";
import { handleSocketEvent } from "~/infra/socket-event-handler";

const RECONNECT_DELAY_MS = 5000;

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
  const { auth } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthenticated = auth.isAuthenticated;
  // Bumped to force the effect to re-run (reconnect) after a dropped socket.
  const [, forceReconnect] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const socket = new WebSocket(buildWsUrl());
    socket.binaryType = "arraybuffer";
    const textDecoder = new TextDecoder();
    socketRef.current = socket;

    const onMessage = (event: MessageEvent) => {
      const payload = decodeSocketPayload(event.data, textDecoder);
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
      reconnectTimerRef.current = setTimeout(forceReconnect, RECONNECT_DELAY_MS);
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
  }, [isAuthenticated, queryClient, forceReconnect]);
}
