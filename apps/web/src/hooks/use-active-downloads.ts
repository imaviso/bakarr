import { createEffect } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { DownloadStatus } from "~/lib/api";
import { createDownloadQueueQuery } from "~/lib/api";

export function useActiveDownloads() {
  const [downloads, setDownloads] = createStore<DownloadStatus[]>([]);
  const queueQuery = createDownloadQueueQuery();

  createEffect(() => {
    setDownloads(reconcile(queueQuery.data ?? [], { key: "hash", merge: true }));
  });

  return downloads;
}
