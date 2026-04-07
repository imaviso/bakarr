import type { NotificationEvent } from "@bakarr/shared";
import type { DownloadStatus } from "~/lib/api";

export function parseDownloadProgressFromSse(data: string): DownloadStatus[] | undefined {
  try {
    const event: NotificationEvent = JSON.parse(data);
    if (event.type !== "DownloadProgress") {
      return undefined;
    }

    return event.payload.downloads;
  } catch {
    return undefined;
  }
}
