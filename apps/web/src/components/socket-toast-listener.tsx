import { useQueryClient } from "@tanstack/solid-query";
import { createEffect, onCleanup } from "solid-js";
import { toast } from "solid-sonner";
import { decodeNotificationEventWire, type NotificationEvent } from "@bakarr/shared";
import { animeKeys } from "~/lib/api";
import { useAuth } from "~/lib/auth";
import { getNotificationToastCopy } from "~/lib/notification-metadata";
import { setSharedSocketAuthenticated, subscribeSharedSocket } from "~/lib/socket-events";

const EVENT_TOAST_ID: Partial<Record<NotificationEvent["type"], string>> = {
  DownloadFinished: "ops.download",
  DownloadStarted: "ops.download",
  ImportFinished: "ops.import",
  ImportStarted: "ops.import",
  LibraryScanFinished: "ops.library-scan",
  LibraryScanStarted: "ops.library-scan",
  RefreshFinished: "ops.refresh",
  RefreshStarted: "ops.refresh",
  RenameFinished: "ops.rename",
  RenameStarted: "ops.rename",
  RssCheckFinished: "ops.rss",
  RssCheckStarted: "ops.rss",
  ScanFolderFinished: "ops.scan-folder",
  ScanFolderStarted: "ops.scan-folder",
  SearchMissingFinished: "ops.search-missing",
  SearchMissingStarted: "ops.search-missing",
};

export function SocketToastListener() {
  const queryClient = useQueryClient();
  const { auth } = useAuth();

  const handleEvent = (event: NotificationEvent) => {
    const toastId = EVENT_TOAST_ID[event.type];
    const toastOptions = toastId ? { id: toastId } : undefined;

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
          toast.loading(copy?.message ?? `Download started: ${event.payload.title}`, {
            description: copy?.description,
            ...toastOptions,
          });
        }
        break;
      case "DownloadFinished":
        {
          if (toastId) {
            toast.dismiss(toastId);
          }
          const copy = getNotificationToastCopy(event);
          toast.success(copy?.message ?? `Download finished: ${event.payload.title}`, {
            description: copy?.description,
          });
        }
        void queryClient.invalidateQueries({ queryKey: animeKeys.all });
        if (event.payload.anime_id) {
          void queryClient.invalidateQueries({
            queryKey: animeKeys.detail(event.payload.anime_id),
          });
        }
        break;
      case "RefreshStarted":
        toast.loading(`Refreshing metadata for ${event.payload.title}`, toastOptions);
        break;
      case "RefreshFinished":
        if (toastId) {
          toast.dismiss(toastId);
        }
        toast.success(`Metadata refreshed for ${event.payload.title}`);
        void queryClient.invalidateQueries({ queryKey: animeKeys.all });
        if (event.payload.anime_id) {
          void queryClient.invalidateQueries({
            queryKey: animeKeys.detail(event.payload.anime_id),
          });
          void queryClient.invalidateQueries({
            queryKey: animeKeys.episodes(event.payload.anime_id),
          });
        }
        break;
      case "SearchMissingStarted":
        toast.loading(`Searching missing episodes for ${event.payload.title}`, toastOptions);
        break;
      case "SearchMissingFinished":
        if (toastId) {
          toast.dismiss(toastId);
        }
        toast.success(
          `Search complete for ${event.payload.title}. Found ${event.payload.count} releases.`,
        );
        break;
      case "ScanFolderStarted":
        toast.loading(`Scanning folder for ${event.payload.title}`, toastOptions);
        break;
      case "ScanFolderFinished":
        if (toastId) {
          toast.dismiss(toastId);
        }
        toast.success(
          `Folder scan complete for ${event.payload.title}. Found ${event.payload.found} files.`,
        );
        if (event.payload.anime_id) {
          void queryClient.invalidateQueries({
            queryKey: animeKeys.episodes(event.payload.anime_id),
          });
          void queryClient.invalidateQueries({
            queryKey: animeKeys.detail(event.payload.anime_id),
          });
        }
        void queryClient.invalidateQueries({ queryKey: animeKeys.all });
        break;
      case "RenameStarted":
        toast.loading(`Renaming files for ${event.payload.title}`, toastOptions);
        break;
      case "RenameFinished":
        if (toastId) {
          toast.dismiss(toastId);
        }
        toast.success(
          `Renaming complete for ${event.payload.title}. Renamed ${event.payload.count} files.`,
        );
        if (event.payload.anime_id) {
          void queryClient.invalidateQueries({
            queryKey: animeKeys.episodes(event.payload.anime_id),
          });
        }
        break;
      case "ImportStarted":
        toast.loading(`Importing ${event.payload.count} files...`, toastOptions);
        break;
      case "ImportFinished":
        {
          if (toastId) {
            toast.dismiss(toastId);
          }
          const copy = getNotificationToastCopy(event);
          toast.success(
            copy?.message ??
              `Import finished. Imported ${event.payload.imported}, Failed ${event.payload.failed}`,
            {
              description: copy?.description,
            },
          );
        }
        void queryClient.invalidateQueries({ queryKey: animeKeys.all });
        break;
      case "LibraryScanStarted":
        toast.loading("Library file scan started", toastOptions);
        break;
      case "LibraryScanFinished":
        if (toastId) {
          toast.dismiss(toastId);
        }
        toast.success(
          `Library file scan finished. Scanned ${event.payload.scanned}, Matched ${event.payload.matched}`,
        );
        void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
        break;
      case "RssCheckStarted":
        toast.loading("RSS check started", toastOptions);
        break;
      case "RssCheckFinished":
        if (toastId) {
          toast.dismiss(toastId);
        }
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

  const unsubscribe = subscribeSharedSocket({
    onMessage: (event) => {
      const decoded = decodeNotificationEventWire(event.data);

      if (decoded._tag === "Left") {
        return;
      }

      handleEvent(decoded.right);
    },
  });

  createEffect(() => {
    if (auth().isAuthenticated) {
      setSharedSocketAuthenticated(true);
    } else {
      setSharedSocketAuthenticated(false);
    }
  });

  onCleanup(() => {
    unsubscribe();
  });

  return null;
}
