import { useQueryClient } from "@tanstack/solid-query";
import { createEffect, onCleanup } from "solid-js";
import { toast } from "solid-sonner";
import type { NotificationEvent } from "@bakarr/shared";
import { useAuth } from "~/lib/auth";
import { getNotificationToastCopy } from "~/lib/notification-metadata";

export function SseToastListener() {
  const queryClient = useQueryClient();
  const { auth } = useAuth();
  let eventSource: EventSource | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;

  const disconnect = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
  };

  const connect = () => {
    disconnect();

    eventSource = new EventSource("/api/events");

    eventSource.onopen = () => {
      console.log("SSE Connected");
    };

    eventSource.onmessage = (event) => {
      try {
        const data: NotificationEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.error("Failed to parse SSE event", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error", err);
      eventSource?.close();
      eventSource = null;

      if (!retryTimeout && auth().isAuthenticated) {
        retryTimeout = setTimeout(() => {
          retryTimeout = null;
          connect();
        }, 5000);
      }
    };
  };

  const handleEvent = (event: NotificationEvent) => {
    switch (event.type) {
      case "ScanStarted":
        toast.info("Library scan started");
        break;
      case "ScanFinished":
        toast.success("Library scan finished");
        break;
      case "DownloadStarted":
        {
          const copy = getNotificationToastCopy(event);
          toast.info(copy?.message ?? `Download started: ${event.payload.title}`, {
            description: copy?.description,
          });
        }
        break;
      case "DownloadFinished":
        {
          const copy = getNotificationToastCopy(event);
          toast.success(copy?.message ?? `Download finished: ${event.payload.title}`, {
            description: copy?.description,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["anime"] });
        if (event.payload.anime_id) {
          queryClient.invalidateQueries({
            queryKey: ["anime", event.payload.anime_id],
          });
        }
        break;
      case "RefreshStarted":
        toast.info(`Refreshing metadata for ${event.payload.title}`);
        break;
      case "RefreshFinished":
        toast.success(`Metadata refreshed for ${event.payload.title}`);
        queryClient.invalidateQueries({ queryKey: ["anime"] });
        if (event.payload.anime_id) {
          queryClient.invalidateQueries({
            queryKey: ["anime", event.payload.anime_id],
          });
          queryClient.invalidateQueries({
            queryKey: ["anime", event.payload.anime_id, "episodes"],
          });
        }
        break;
      case "SearchMissingStarted":
        toast.info(`Searching missing episodes for ${event.payload.title}`);
        break;
      case "SearchMissingFinished":
        toast.success(
          `Search complete for ${event.payload.title}. Found ${event.payload.count} releases.`,
        );
        break;
      case "ScanFolderStarted":
        toast.info(`Scanning folder for ${event.payload.title}`);
        break;
      case "ScanFolderFinished":
        toast.success(
          `Folder scan complete for ${event.payload.title}. Found ${event.payload.found} files.`,
        );
        if (event.payload.anime_id) {
          queryClient.invalidateQueries({
            queryKey: ["anime", event.payload.anime_id, "episodes"],
          });
          queryClient.invalidateQueries({
            queryKey: ["anime", event.payload.anime_id],
          });
        }
        queryClient.invalidateQueries({ queryKey: ["anime"] });
        break;
      case "RenameStarted":
        toast.info(`Renaming files for ${event.payload.title}`);
        break;
      case "RenameFinished":
        toast.success(
          `Renaming complete for ${event.payload.title}. Renamed ${event.payload.count} files.`,
        );
        if (event.payload.anime_id) {
          queryClient.invalidateQueries({
            queryKey: ["anime", event.payload.anime_id, "episodes"],
          });
        }
        break;
      case "ImportStarted":
        toast.info(`Importing ${event.payload.count} files...`);
        break;
      case "ImportFinished":
        {
          const copy = getNotificationToastCopy(event);
          toast.success(
            copy?.message ??
              `Import finished. Imported ${event.payload.imported}, Failed ${event.payload.failed}`,
            {
              description: copy?.description,
            },
          );
        }
        queryClient.invalidateQueries({ queryKey: ["anime"] });
        break;
      case "LibraryScanStarted":
        toast.info("Library file scan started");
        break;
      case "LibraryScanFinished":
        toast.success(
          `Library file scan finished. Scanned ${event.payload.scanned}, Matched ${event.payload.matched}`,
        );
        break;
      case "RssCheckStarted":
        toast.info("RSS check started");
        break;
      case "RssCheckFinished":
        toast.success(`RSS check finished. Found ${event.payload.new_items} new items.`);
        break;
      case "Error":
        toast.error(event.payload.message);
        break;
      case "Info":
        toast.info(event.payload.message);
        break;

      case "ScanProgress":
      case "LibraryScanProgress":
      case "RssCheckProgress":
      case "DownloadProgress":
      case "SystemStatus":
        break;
    }
  };

  createEffect(() => {
    if (auth().isAuthenticated) {
      connect();
    } else {
      disconnect();
    }
  });

  onCleanup(() => {
    disconnect();
  });

  return null;
}
