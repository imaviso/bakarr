import { useSuspenseQuery } from "@tanstack/react-query";
import { downloadQueueQueryOptions } from "~/api/system-downloads";

export function useActiveDownloads() {
  return useSuspenseQuery(downloadQueueQueryOptions()).data;
}
