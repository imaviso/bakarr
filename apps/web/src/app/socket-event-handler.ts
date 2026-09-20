import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { type NotificationEvent } from "@bakarr/shared";
import { animeKeys } from "@/api/keys";
import type { DownloadStatus, SystemStatus } from "@/api/contracts";
import { getNotificationToastCopy } from "@/domain/notification-metadata";
import {
  getNotificationPreferenceKeyForEvent,
  readNotificationPreferences,
} from "@/infra/notification-preferences";

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

interface HandlerContext {
  readonly notificationsEnabled: boolean;
  readonly qc: QueryClient;
  readonly toastId?: string;
}

type EventHandlers = {
  [T in NotificationEvent["type"]]: (
    event: Extract<NotificationEvent, { type: T }>,
    ctx: HandlerContext,
  ) => void;
};

function invalidateLibraryActivity(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: animeKeys.all });
  void qc.invalidateQueries({ queryKey: animeKeys.downloads.all });
  void qc.invalidateQueries({ queryKey: animeKeys.library.activity() });
  void qc.invalidateQueries({ queryKey: animeKeys.system.status() });
}

function loadingOptions(toastId: string | undefined): { readonly id: string } | undefined {
  return toastId === undefined ? undefined : { id: toastId };
}

const eventHandlers: EventHandlers = {
  ScanStarted: (_event, { notificationsEnabled }) => {
    if (notificationsEnabled) toast.info("Library scan started");
  },

  ScanFinished: (_event, { notificationsEnabled }) => {
    if (notificationsEnabled) toast.success("Library scan finished");
  },

  ScanProgress: () => {
    // Intentionally a no-op.
  },

  DownloadStarted: (event, { notificationsEnabled, toastId }) => {
    if (notificationsEnabled) {
      const copy = getNotificationToastCopy(event);
      const options = loadingOptions(toastId);
      toast.loading(copy?.message ?? `Download started: ${event.payload.title}`, {
        description: copy?.description,
        ...options,
      });
    }
  },

  DownloadFinished: (event, { notificationsEnabled, qc, toastId }) => {
    if (toastId) toast.dismiss(toastId);
    if (notificationsEnabled) {
      const copy = getNotificationToastCopy(event);
      toast.success(copy?.message ?? `Download finished: ${event.payload.title}`, {
        description: copy?.description,
      });
    }
    invalidateLibraryActivity(qc);
    if (event.payload.media_id) {
      void qc.invalidateQueries({ queryKey: animeKeys.detail(event.payload.media_id) });
    }
  },

  RefreshStarted: (event, { notificationsEnabled, toastId }) => {
    if (notificationsEnabled) {
      toast.loading(`Refreshing metadata for ${event.payload.title}`, loadingOptions(toastId));
    }
  },

  RefreshFinished: (event, { notificationsEnabled, qc, toastId }) => {
    if (toastId) toast.dismiss(toastId);
    if (notificationsEnabled) {
      toast.success(`Metadata refreshed for ${event.payload.title}`);
    }
    void qc.invalidateQueries({ queryKey: animeKeys.all });
    if (event.payload.media_id) {
      void qc.invalidateQueries({ queryKey: animeKeys.detail(event.payload.media_id) });
      void qc.invalidateQueries({ queryKey: animeKeys.units(event.payload.media_id) });
    }
  },

  SearchMissingStarted: (event, { notificationsEnabled, toastId }) => {
    if (notificationsEnabled) {
      toast.loading(`Searching missing units for ${event.payload.title}`, loadingOptions(toastId));
    }
  },

  SearchMissingFinished: (event, { notificationsEnabled, toastId }) => {
    if (toastId) toast.dismiss(toastId);
    if (notificationsEnabled) {
      toast.success(
        `Search complete for ${event.payload.title}. Found ${event.payload.count} releases.`,
      );
    }
  },

  ScanFolderStarted: (event, { notificationsEnabled, toastId }) => {
    if (notificationsEnabled) {
      toast.loading(`Scanning folder for ${event.payload.title}`, loadingOptions(toastId));
    }
  },

  ScanFolderFinished: (event, { notificationsEnabled, qc, toastId }) => {
    if (toastId) toast.dismiss(toastId);
    if (notificationsEnabled) {
      toast.success(
        `Folder scan complete for ${event.payload.title}. Found ${event.payload.found} files.`,
      );
    }
    if (event.payload.media_id) {
      void qc.invalidateQueries({ queryKey: animeKeys.units(event.payload.media_id) });
      void qc.invalidateQueries({ queryKey: animeKeys.detail(event.payload.media_id) });
    }
    void qc.invalidateQueries({ queryKey: animeKeys.all });
  },

  RenameStarted: (event, { notificationsEnabled, toastId }) => {
    if (notificationsEnabled) {
      toast.loading(`Renaming files for ${event.payload.title}`, loadingOptions(toastId));
    }
  },

  RenameFinished: (event, { notificationsEnabled, qc, toastId }) => {
    if (toastId) toast.dismiss(toastId);
    if (notificationsEnabled) {
      toast.success(
        `Renaming complete for ${event.payload.title}. Renamed ${event.payload.count} files.`,
      );
    }
    if (event.payload.media_id) {
      void qc.invalidateQueries({ queryKey: animeKeys.units(event.payload.media_id) });
    }
  },

  ImportStarted: (event, { notificationsEnabled, toastId }) => {
    if (notificationsEnabled) {
      toast.loading(`Importing ${event.payload.count} files...`, loadingOptions(toastId));
    }
  },

  ImportFinished: (event, { notificationsEnabled, qc, toastId }) => {
    if (toastId) toast.dismiss(toastId);
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
    invalidateLibraryActivity(qc);
  },

  LibraryScanStarted: (_event, { notificationsEnabled, qc, toastId }) => {
    if (notificationsEnabled) {
      toast.loading("Library file scan started", loadingOptions(toastId));
    }
    void qc.invalidateQueries({ queryKey: animeKeys.system.jobs() });
  },

  LibraryScanFinished: (event, { notificationsEnabled, qc, toastId }) => {
    if (toastId) toast.dismiss(toastId);
    if (notificationsEnabled) {
      toast.success(
        `Library file scan finished. Scanned ${event.payload.scanned}, Matched ${event.payload.matched}`,
      );
    }
    void qc.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    void qc.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
  },

  LibraryScanProgress: () => {
    // No-op: jobs query polls while running; Finished event invalidates.
  },

  RssCheckStarted: (_event, { notificationsEnabled, qc, toastId }) => {
    if (notificationsEnabled) {
      toast.loading("RSS check started", loadingOptions(toastId));
    }
    void qc.invalidateQueries({ queryKey: animeKeys.system.jobs() });
  },

  RssCheckFinished: (event, { notificationsEnabled, qc, toastId }) => {
    if (toastId) toast.dismiss(toastId);
    if (notificationsEnabled) {
      toast.success(`RSS check finished. Found ${event.payload.new_items} new items.`);
    }
    void qc.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    void qc.invalidateQueries({ queryKey: animeKeys.system.status() });
  },

  RssCheckProgress: () => {
    // No-op: Finished event invalidates; no client progress synthesis.
  },

  PasswordChanged: (_event, { notificationsEnabled }) => {
    if (notificationsEnabled) toast.success("Password changed successfully");
  },

  ApiKeyRegenerated: (_event, { notificationsEnabled }) => {
    if (notificationsEnabled) toast.success("API key regenerated successfully");
  },

  Error: (event, { notificationsEnabled }) => {
    if (notificationsEnabled) toast.error(event.payload.message);
  },

  Info: (event, { notificationsEnabled }) => {
    if (notificationsEnabled) toast.info(event.payload.message);
  },

  DownloadProgress: (event, { qc }) => {
    qc.setQueryData<DownloadStatus[]>(animeKeys.downloads.queue(), event.payload.downloads);
  },

  SystemStatus: (event, { qc }) => {
    qc.setQueryData<SystemStatus>(animeKeys.system.status(), event.payload);
  },
};

export function handleSocketEvent(queryClient: QueryClient, event: NotificationEvent) {
  const toastId = EVENT_TOAST_ID[event.type];
  const toastPreferenceKey = getNotificationPreferenceKeyForEvent(event);
  const notificationsEnabled =
    toastPreferenceKey === null || readNotificationPreferences()[toastPreferenceKey];

  const ctx: HandlerContext = {
    notificationsEnabled,
    qc: queryClient,
    ...(toastId === undefined ? {} : { toastId }),
  };

  switch (event.type) {
    case "ScanStarted":
      return eventHandlers.ScanStarted(event, ctx);
    case "ScanFinished":
      return eventHandlers.ScanFinished(event, ctx);
    case "ScanProgress":
      return eventHandlers.ScanProgress(event, ctx);
    case "DownloadStarted":
      return eventHandlers.DownloadStarted(event, ctx);
    case "DownloadFinished":
      return eventHandlers.DownloadFinished(event, ctx);
    case "RefreshStarted":
      return eventHandlers.RefreshStarted(event, ctx);
    case "RefreshFinished":
      return eventHandlers.RefreshFinished(event, ctx);
    case "SearchMissingStarted":
      return eventHandlers.SearchMissingStarted(event, ctx);
    case "SearchMissingFinished":
      return eventHandlers.SearchMissingFinished(event, ctx);
    case "ScanFolderStarted":
      return eventHandlers.ScanFolderStarted(event, ctx);
    case "ScanFolderFinished":
      return eventHandlers.ScanFolderFinished(event, ctx);
    case "RenameStarted":
      return eventHandlers.RenameStarted(event, ctx);
    case "RenameFinished":
      return eventHandlers.RenameFinished(event, ctx);
    case "ImportStarted":
      return eventHandlers.ImportStarted(event, ctx);
    case "ImportFinished":
      return eventHandlers.ImportFinished(event, ctx);
    case "LibraryScanStarted":
      return eventHandlers.LibraryScanStarted(event, ctx);
    case "LibraryScanFinished":
      return eventHandlers.LibraryScanFinished(event, ctx);
    case "LibraryScanProgress":
      return eventHandlers.LibraryScanProgress(event, ctx);
    case "RssCheckStarted":
      return eventHandlers.RssCheckStarted(event, ctx);
    case "RssCheckFinished":
      return eventHandlers.RssCheckFinished(event, ctx);
    case "RssCheckProgress":
      return eventHandlers.RssCheckProgress(event, ctx);
    case "PasswordChanged":
      return eventHandlers.PasswordChanged(event, ctx);
    case "ApiKeyRegenerated":
      return eventHandlers.ApiKeyRegenerated(event, ctx);
    case "Error":
      return eventHandlers.Error(event, ctx);
    case "Info":
      return eventHandlers.Info(event, ctx);
    case "DownloadProgress":
      return eventHandlers.DownloadProgress(event, ctx);
    case "SystemStatus":
      return eventHandlers.SystemStatus(event, ctx);
  }
}
