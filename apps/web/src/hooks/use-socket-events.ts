import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "~/lib/auth";
import { decodeNotificationEventWire, handleSocketEvent } from "~/lib/socket-event-handler";
import { setSharedSocketAuthenticated, subscribeSharedSocket } from "~/lib/socket-events";

export function useSocketEvents() {
  const queryClient = useQueryClient();
  const { auth } = useAuth();

  useEffect(() => {
    const unsubscribe = subscribeSharedSocket({
      onMessage: (event) => {
        const decoded = decodeNotificationEventWire(event.data);

        if (decoded._tag === "Left") {
          return;
        }

        handleSocketEvent(queryClient, decoded.right);
      },
    });

    setSharedSocketAuthenticated(auth.isAuthenticated);

    return () => {
      unsubscribe();
    };
  }, [auth.isAuthenticated, queryClient]);
}
