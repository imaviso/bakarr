import { useSuspenseQuery } from "@tanstack/react-query";
import { downloadQueueQueryOptions } from "~/api";

export function useActiveDownloads() {
  return useSuspenseQuery(downloadQueueQueryOptions()).data;
}
