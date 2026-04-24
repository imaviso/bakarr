import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { decodeNotificationEventWire, handleSocketEvent } from "~/lib/socket-event-handler";
import { subscribeSocketMessages } from "~/lib/effect/socket-service";

export function useSocketEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeSocketMessages((event) => {
      const decoded = decodeNotificationEventWire(event.data);
      if (decoded._tag === "Right") {
        handleSocketEvent(queryClient, decoded.right);
      }
    });

    return unsubscribe;
  }, [queryClient]);
}
