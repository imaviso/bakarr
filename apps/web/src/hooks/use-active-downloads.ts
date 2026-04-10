import { createEffect, onCleanup, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { DownloadStatus } from "~/lib/api";
import { useAuth } from "~/lib/auth";
import { setSharedSseAuthenticated, subscribeSharedSse } from "~/lib/sse-events";
import { parseDownloadProgressFromSse } from "~/hooks/use-active-downloads-state";

export function useActiveDownloads() {
  const [downloads, setDownloads] = createStore<DownloadStatus[]>([]);
  const { auth } = useAuth();
  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    unsubscribe = subscribeSharedSse({
      onMessage: (event) => {
        const downloads = parseDownloadProgressFromSse(event.data);
        if (downloads) {
          setDownloads(reconcile(downloads, { key: "hash", merge: true }));
        }
      },
    });
  });

  createEffect(() => {
    if (!auth().isAuthenticated) {
      setSharedSseAuthenticated(false);
      setDownloads(reconcile([]));
      return;
    }

    setSharedSseAuthenticated(true);
  });

  onCleanup(() => {
    unsubscribe?.();
  });

  return downloads;
}
