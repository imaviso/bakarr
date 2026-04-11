import { decodeNotificationEventWire } from "@bakarr/shared";
import type { DownloadStatus } from "~/lib/api";

export function parseDownloadProgressFromSocketMessage(data: string): DownloadStatus[] | undefined {
  const event = decodeNotificationEventWire(data);

  if (event._tag === "Left") {
    return undefined;
  }

  if (event.right.type !== "DownloadProgress") {
    return undefined;
  }

  return event.right.payload.downloads;
}
