import { createEffect, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { DownloadStatus } from "~/lib/api";
import { useAuth } from "~/lib/auth";
import { createSseConnection } from "~/lib/sse-events";
import { parseDownloadProgressFromSse } from "~/hooks/use-active-downloads-state";

export function useActiveDownloads() {
  const [downloads, setDownloads] = createStore<DownloadStatus[]>([]);
  const { auth } = useAuth();

  const sse = createSseConnection({
    isAuthenticated: () => auth().isAuthenticated,
    onMessage: (event) => {
      const downloads = parseDownloadProgressFromSse(event.data);
      if (downloads) {
        setDownloads(reconcile(downloads, { key: "hash", merge: true }));
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
