import { useSuspenseQuery } from "@tanstack/react-query";
import { downloadQueueQueryOptions } from "~/lib/api";

export function useActiveDownloads() {
  return useSuspenseQuery(downloadQueueQueryOptions()).data;
}
