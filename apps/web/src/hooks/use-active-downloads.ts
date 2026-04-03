import { createEffect, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { NotificationEvent } from "@bakarr/shared";
import type { DownloadStatus } from "~/lib/api";
import { useAuth } from "~/lib/auth";
import { createSseConnection } from "~/lib/sse-events";

export function useActiveDownloads() {
  const [downloads, setDownloads] = createStore<DownloadStatus[]>([]);
  const { auth } = useAuth();

  const sse = createSseConnection({
    isAuthenticated: () => auth().isAuthenticated,
    onMessage: (event) => {
      try {
        const data: NotificationEvent = JSON.parse(event.data);
        if (data.type === "DownloadProgress") {
          setDownloads(reconcile(data.payload.downloads, { key: "hash", merge: true }));
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    },
  });

  createEffect(() => {
    if (!auth().isAuthenticated) {
      sse.disconnect();
      setDownloads(reconcile([]));
      return;
    }

    sse.connect();
  });

  onCleanup(() => {
    sse.disconnect();
  });

  return downloads;
}
