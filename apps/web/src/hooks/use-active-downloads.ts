import { createEffect, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { NotificationEvent } from "@bakarr/shared";
import type { DownloadStatus } from "~/lib/api";
import { useAuth } from "~/lib/auth";

export function useActiveDownloads() {
  const [downloads, setDownloads] = createStore<DownloadStatus[]>([]);
  const { auth } = useAuth();
  let eventSource: EventSource | null = null;

  const disconnect = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  createEffect(() => {
    if (!auth().isAuthenticated) {
      disconnect();
      setDownloads(reconcile([]));
      return;
    }

    disconnect();
    eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      try {
        const data: NotificationEvent = JSON.parse(event.data);

        if (data.type === "DownloadProgress") {
          setDownloads(reconcile(data.payload.downloads, { key: "hash", merge: true }));
        }
      } catch (e) {
        console.error("Failed to parse event", e);
      }
    };

    eventSource.onerror = (_e) => {
      disconnect();
    };
  });

  onCleanup(() => {
    disconnect();
  });

  return downloads;
}
