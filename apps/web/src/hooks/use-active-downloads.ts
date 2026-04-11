import { createMemo } from "solid-js";
import { createDownloadQueueQuery } from "~/lib/api";

export function useActiveDownloads() {
  const queueQuery = createDownloadQueueQuery();

  return createMemo(() => queueQuery.data ?? []);
}
