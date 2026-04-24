import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { decodeNotificationEventWire, type NotificationEvent } from "@bakarr/shared";
import {
  animeKeys,
  type BackgroundJobStatus,
  type DownloadStatus,
  type SystemStatus,
} from "~/lib/api";
import { getNotificationToastCopy } from "~/lib/notification-metadata";
import {
  getNotificationPreferenceKeyForEvent,
  readNotificationPreferences,
} from "~/lib/notification-preferences";

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

function updateJobStatus(
  previousJobs: BackgroundJobStatus[] | undefined,
  name: string,
  updater: (job: BackgroundJobStatus) => BackgroundJobStatus,
) {
  if (!previousJobs) {
    return previousJobs;
  }

  const targetIndex = previousJobs.findIndex((job) => job.name === name);
  if (targetIndex < 0) {
    return previousJobs;
  }

  const nextJobs = [...previousJobs];
  nextJobs[targetIndex] = updater(nextJobs[targetIndex]!);
  return nextJobs;
}

export { decodeNotificationEventWire };

export function handleSocketEvent(queryClient: QueryClient, event: NotificationEvent) {
  const toastId = EVENT_TOAST_ID[event.type];
  const toastOptions = toastId ? { id: toastId } : undefined;
  const toastPreferenceKey = getNotificationPreferenceKeyForEvent(event);
  const notificationsEnabled =
    toastPreferenceKey === null || readNotificationPreferences()[toastPreferenceKey];

  switch (event.type) {
    case "ScanStarted":
      if (notificationsEnabled) {
        toast.info("Library scan started");
      }
      break;
    case "ScanFinished":
      if (notificationsEnabled) {
        toast.success("Library scan finished");
      }
      break;
    case "DownloadStarted":
      if (notificationsEnabled) {
        const copy = getNotificationToastCopy(event);
        toast.loading(copy?.message ?? `Download started: ${event.payload.title}`, {
          description: copy?.description,
          ...toastOptions,
        });
      }
      break;
    case "DownloadFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }

      if (notificationsEnabled) {
        const copy = getNotificationToastCopy(event);
        toast.success(copy?.message ?? `Download finished: ${event.payload.title}`, {
          description: copy?.description,
        });
      }
      void queryClient.invalidateQueries({ queryKey: animeKeys.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.activity() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
      if (event.payload.anime_id) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.detail(event.payload.anime_id),
        });
      }
      break;
    case "RefreshStarted":
      if (notificationsEnabled) {
        toast.loading(`Refreshing metadata for ${event.payload.title}`, toastOptions);
      }
      break;
    case "RefreshFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (notificationsEnabled) {
        toast.success(`Metadata refreshed for ${event.payload.title}`);
      }
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
      if (notificationsEnabled) {
        toast.loading(`Searching missing episodes for ${event.payload.title}`, toastOptions);
      }
      break;
    case "SearchMissingFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (notificationsEnabled) {
        toast.success(
          `Search complete for ${event.payload.title}. Found ${event.payload.count} releases.`,
        );
      }
      break;
    case "ScanFolderStarted":
      if (notificationsEnabled) {
        toast.loading(`Scanning folder for ${event.payload.title}`, toastOptions);
      }
      break;
    case "ScanFolderFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (notificationsEnabled) {
        toast.success(
          `Folder scan complete for ${event.payload.title}. Found ${event.payload.found} files.`,
        );
      }
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
      if (notificationsEnabled) {
        toast.loading(`Renaming files for ${event.payload.title}`, toastOptions);
      }
      break;
    case "RenameFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (notificationsEnabled) {
        toast.success(
          `Renaming complete for ${event.payload.title}. Renamed ${event.payload.count} files.`,
        );
      }
      if (event.payload.anime_id) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.episodes(event.payload.anime_id),
        });
      }
      break;
    case "ImportStarted":
      if (notificationsEnabled) {
        toast.loading(`Importing ${event.payload.count} files...`, toastOptions);
      }
      break;
    case "ImportFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }

      if (notificationsEnabled) {
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
      void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.activity() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
      break;
    case "LibraryScanStarted":
      if (notificationsEnabled) {
        toast.loading("Library file scan started", toastOptions);
      }
      queryClient.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
        updateJobStatus(previousJobs, "unmapped_scan", (job) => ({
          ...job,
          is_running: true,
          last_status: "running",
        })),
      );
      break;
    case "LibraryScanFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (notificationsEnabled) {
        toast.success(
          `Library file scan finished. Scanned ${event.payload.scanned}, Matched ${event.payload.matched}`,
        );
      }
      queryClient.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
        updateJobStatus(previousJobs, "unmapped_scan", (job) => ({
          ...job,
          is_running: false,
          last_message: `Scanned ${event.payload.scanned}, matched ${event.payload.matched}`,
          last_status: "ok",
          progress_current: event.payload.scanned,
          progress_total: event.payload.scanned,
        })),
      );
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      break;
    case "RssCheckStarted":
      if (notificationsEnabled) {
        toast.loading("RSS check started", toastOptions);
      }
      queryClient.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
        updateJobStatus(previousJobs, "rss_check", (job) => ({
          ...job,
          is_running: true,
          last_status: "running",
        })),
      );
      break;
    case "RssCheckFinished":
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (notificationsEnabled) {
        toast.success(`RSS check finished. Found ${event.payload.new_items} new items.`);
      }
      queryClient.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
        updateJobStatus(previousJobs, "rss_check", (job) => ({
          ...job,
          is_running: false,
          last_message: `Found ${event.payload.new_items} new items`,
          last_status: "ok",
        })),
      );
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
      break;
    case "PasswordChanged":
      if (notificationsEnabled) {
        toast.success("Password changed successfully");
      }
      break;
    case "ApiKeyRegenerated":
      if (notificationsEnabled) {
        toast.success("API key regenerated successfully");
      }
      void queryClient.invalidateQueries({ queryKey: animeKeys.auth.apiKey() });
      break;
    case "Error":
      if (notificationsEnabled) {
        toast.error(event.payload.message);
      }
      break;
    case "Info":
      if (notificationsEnabled) {
        toast.info(event.payload.message);
      }
      break;

    case "ScanProgress":
      break;
    case "LibraryScanProgress":
      queryClient.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
        updateJobStatus(previousJobs, "unmapped_scan", (job) => ({
          ...job,
          is_running: true,
          progress_current: event.payload.scanned,
          progress_total:
            typeof job.progress_total === "number"
              ? Math.max(job.progress_total, event.payload.scanned)
              : event.payload.scanned,
        })),
      );
      break;
    case "RssCheckProgress":
      queryClient.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
        updateJobStatus(previousJobs, "rss_check", (job) => ({
          ...job,
          is_running: true,
          last_message: `Checking ${event.payload.feed_name}`,
          progress_current: event.payload.current,
          progress_total: event.payload.total,
        })),
      );
      break;
    case "DownloadProgress":
      queryClient.setQueryData<DownloadStatus[]>(
        animeKeys.downloads.queue(),
        event.payload.downloads,
      );
      queryClient.setQueryData<SystemStatus>(animeKeys.system.status(), (previousStatus) => {
        if (!previousStatus) {
          return previousStatus;
        }

        return {
          ...previousStatus,
          pending_downloads: event.payload.downloads.length,
        };
      });
      break;
    case "SystemStatus":
      queryClient.setQueryData<SystemStatus>(animeKeys.system.status(), event.payload);
      break;
  }
}
