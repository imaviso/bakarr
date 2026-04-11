import { createEffect, onCleanup, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { DownloadStatus } from "~/lib/api";
import { useAuth } from "~/lib/auth";
import { setSharedSocketAuthenticated, subscribeSharedSocket } from "~/lib/socket-events";
import { parseDownloadProgressFromSocketMessage } from "~/hooks/use-active-downloads-state";

export function useActiveDownloads() {
  const [downloads, setDownloads] = createStore<DownloadStatus[]>([]);
  const { auth } = useAuth();
  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    unsubscribe = subscribeSharedSocket({
      onMessage: (event) => {
        const downloads = parseDownloadProgressFromSocketMessage(event.data);
        if (downloads) {
          setDownloads(reconcile(downloads, { key: "hash", merge: true }));
        }
      },
    });
  });

  createEffect(() => {
    if (!auth().isAuthenticated) {
      setSharedSocketAuthenticated(false);
      setDownloads(reconcile([]));
      return;
    }

    setSharedSocketAuthenticated(true);
  });

  onCleanup(() => {
    unsubscribe?.();
  });

  return downloads;
}
