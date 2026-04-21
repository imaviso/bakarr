import { createDownloadQueueQuery } from "~/lib/api";

export function useActiveDownloads() {
  const queueQuery = createDownloadQueueQuery();

  return queueQuery.data ?? [];
}
