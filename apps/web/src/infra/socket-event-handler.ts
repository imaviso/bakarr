import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { decodeNotificationEventWire, type NotificationEvent } from "@bakarr/shared";
import { animeKeys } from "~/api/keys";
import type { BackgroundJobStatus, DownloadStatus, SystemStatus } from "~/api/contracts";
import { getNotificationToastCopy } from "~/domain/notification-metadata";
import {
  getNotificationPreferenceKeyForEvent,
  readNotificationPreferences,
} from "~/domain/notification-preferences";

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

interface HandlerContext {
  toastId: string | undefined;
  toastOptions: { id: string } | undefined;
  notificationsEnabled: boolean;
}

type EventHandler<T extends NotificationEvent = NotificationEvent> = (
  queryClient: QueryClient,
  event: T,
  ctx: HandlerContext,
) => void;

const handlers = new Map<NotificationEvent["type"], EventHandler[]>();

function isEventType<T extends NotificationEvent["type"]>(
  event: NotificationEvent,
  type: T,
): event is Extract<NotificationEvent, { type: T }> {
  return event.type === type;
}

function on<T extends NotificationEvent["type"]>(
  type: T,
  ...fns: EventHandler<Extract<NotificationEvent, { type: T }>>[]
) {
  const existing = handlers.get(type) ?? [];
  const wrapped = fns.map<EventHandler>((fn) => (queryClient, event, ctx) => {
    if (!isEventType(event, type)) return;
    fn(queryClient, event, ctx);
  });
  handlers.set(type, [...existing, ...wrapped]);
}

// --- Toast handlers ---

on("ScanStarted", (_qc, _evt, ctx) => {
  if (ctx.notificationsEnabled) toast.info("Library scan started");
});

on("ScanFinished", (_qc, _evt, ctx) => {
  if (ctx.notificationsEnabled) toast.success("Library scan finished");
});

on("DownloadStarted", (_qc, evt, ctx) => {
  if (!ctx.notificationsEnabled) return;
  const copy = getNotificationToastCopy(evt);
  toast.loading(copy?.message ?? `Download started: ${evt.payload.title}`, {
    description: copy?.description,
    ...ctx.toastOptions,
  });
});

on("DownloadFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    const copy = getNotificationToastCopy(evt);
    toast.success(copy?.message ?? `Download finished: ${evt.payload.title}`, {
      description: copy?.description,
    });
  }
});

on("RefreshStarted", (_qc, evt, ctx) => {
  if (ctx.notificationsEnabled) {
    toast.loading(`Refreshing metadata for ${evt.payload.title}`, ctx.toastOptions);
  }
});

on("RefreshFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    toast.success(`Metadata refreshed for ${evt.payload.title}`);
  }
});

on("SearchMissingStarted", (_qc, evt, ctx) => {
  if (ctx.notificationsEnabled) {
    toast.loading(`Searching missing units for ${evt.payload.title}`, ctx.toastOptions);
  }
});

on("SearchMissingFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    toast.success(`Search complete for ${evt.payload.title}. Found ${evt.payload.count} releases.`);
  }
});

on("ScanFolderStarted", (_qc, evt, ctx) => {
  if (ctx.notificationsEnabled) {
    toast.loading(`Scanning folder for ${evt.payload.title}`, ctx.toastOptions);
  }
});

on("ScanFolderFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    toast.success(
      `Folder scan complete for ${evt.payload.title}. Found ${evt.payload.found} files.`,
    );
  }
});

on("RenameStarted", (_qc, evt, ctx) => {
  if (ctx.notificationsEnabled) {
    toast.loading(`Renaming files for ${evt.payload.title}`, ctx.toastOptions);
  }
});

on("RenameFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    toast.success(
      `Renaming complete for ${evt.payload.title}. Renamed ${evt.payload.count} files.`,
    );
  }
});

on("ImportStarted", (_qc, evt, ctx) => {
  if (ctx.notificationsEnabled) {
    toast.loading(`Importing ${evt.payload.count} files...`, ctx.toastOptions);
  }
});

on("ImportFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    const copy = getNotificationToastCopy(evt);
    toast.success(
      copy?.message ??
        `Import finished. Imported ${evt.payload.imported}, Failed ${evt.payload.failed}`,
      {
        description: copy?.description,
      },
    );
  }
});

on("LibraryScanStarted", (_qc, _evt, ctx) => {
  if (ctx.notificationsEnabled) {
    toast.loading("Library file scan started", ctx.toastOptions);
  }
});

on("LibraryScanFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    toast.success(
      `Library file scan finished. Scanned ${evt.payload.scanned}, Matched ${evt.payload.matched}`,
    );
  }
});

on("RssCheckStarted", (_qc, _evt, ctx) => {
  if (ctx.notificationsEnabled) {
    toast.loading("RSS check started", ctx.toastOptions);
  }
});

on("RssCheckFinished", (_qc, evt, ctx) => {
  if (ctx.toastId) toast.dismiss(ctx.toastId);
  if (ctx.notificationsEnabled) {
    toast.success(`RSS check finished. Found ${evt.payload.new_items} new items.`);
  }
});

on("PasswordChanged", (_qc, _evt, ctx) => {
  if (ctx.notificationsEnabled) toast.success("Password changed successfully");
});

on("ApiKeyRegenerated", (_qc, _evt, ctx) => {
  if (ctx.notificationsEnabled) toast.success("API key regenerated successfully");
});

on("Error", (_qc, evt, ctx) => {
  if (ctx.notificationsEnabled) toast.error(evt.payload.message);
});

on("Info", (_qc, evt, ctx) => {
  if (ctx.notificationsEnabled) toast.info(evt.payload.message);
});

// --- Cache invalidation handlers ---

on("DownloadFinished", (qc, evt) => {
  void qc.invalidateQueries({ queryKey: animeKeys.all });
  void qc.invalidateQueries({ queryKey: animeKeys.downloads.all });
  void qc.invalidateQueries({ queryKey: animeKeys.library.activity() });
  void qc.invalidateQueries({ queryKey: animeKeys.system.status() });
  if (evt.payload.anime_id) {
    void qc.invalidateQueries({ queryKey: animeKeys.detail(evt.payload.anime_id) });
  }
});

on("RefreshFinished", (qc, evt) => {
  void qc.invalidateQueries({ queryKey: animeKeys.all });
  if (evt.payload.anime_id) {
    void qc.invalidateQueries({ queryKey: animeKeys.detail(evt.payload.anime_id) });
    void qc.invalidateQueries({ queryKey: animeKeys.episodes(evt.payload.anime_id) });
  }
});

on("ScanFolderFinished", (qc, evt) => {
  if (evt.payload.anime_id) {
    void qc.invalidateQueries({ queryKey: animeKeys.episodes(evt.payload.anime_id) });
    void qc.invalidateQueries({ queryKey: animeKeys.detail(evt.payload.anime_id) });
  }
  void qc.invalidateQueries({ queryKey: animeKeys.all });
});

on("RenameFinished", (qc, evt) => {
  if (evt.payload.anime_id) {
    void qc.invalidateQueries({ queryKey: animeKeys.episodes(evt.payload.anime_id) });
  }
});

on("ImportFinished", (qc) => {
  void qc.invalidateQueries({ queryKey: animeKeys.all });
  void qc.invalidateQueries({ queryKey: animeKeys.downloads.all });
  void qc.invalidateQueries({ queryKey: animeKeys.library.activity() });
  void qc.invalidateQueries({ queryKey: animeKeys.system.status() });
});

on("LibraryScanFinished", (qc) => {
  void qc.invalidateQueries({ queryKey: animeKeys.system.jobs() });
  void qc.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
});

on("RssCheckFinished", (qc) => {
  void qc.invalidateQueries({ queryKey: animeKeys.system.jobs() });
  void qc.invalidateQueries({ queryKey: animeKeys.system.status() });
});

on("ApiKeyRegenerated", (qc) => {
  void qc.invalidateQueries({ queryKey: animeKeys.auth.apiKey() });
});

// --- Job status handlers ---

on("LibraryScanStarted", (qc) => {
  qc.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
    updateJobStatus(previousJobs, "unmapped_scan", (job) => ({
      ...job,
      is_running: true,
      last_status: "running",
    })),
  );
});

on("LibraryScanFinished", (qc, evt) => {
  qc.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
    updateJobStatus(previousJobs, "unmapped_scan", (job) => ({
      ...job,
      is_running: false,
      last_message: `Scanned ${evt.payload.scanned}, matched ${evt.payload.matched}`,
      last_status: "ok",
      progress_current: evt.payload.scanned,
      progress_total: evt.payload.scanned,
    })),
  );
});

on("RssCheckStarted", (qc) => {
  qc.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
    updateJobStatus(previousJobs, "rss_check", (job) => ({
      ...job,
      is_running: true,
      last_status: "running",
    })),
  );
});

on("RssCheckFinished", (qc, evt) => {
  qc.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
    updateJobStatus(previousJobs, "rss_check", (job) => ({
      ...job,
      is_running: false,
      last_message: `Found ${evt.payload.new_items} new items`,
      last_status: "ok",
    })),
  );
});

on("LibraryScanProgress", (qc, evt) => {
  qc.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
    updateJobStatus(previousJobs, "unmapped_scan", (job) => ({
      ...job,
      is_running: true,
      progress_current: evt.payload.scanned,
      progress_total:
        typeof job.progress_total === "number"
          ? Math.max(job.progress_total, evt.payload.scanned)
          : evt.payload.scanned,
    })),
  );
});

on("RssCheckProgress", (qc, evt) => {
  qc.setQueryData<BackgroundJobStatus[]>(animeKeys.system.jobs(), (previousJobs) =>
    updateJobStatus(previousJobs, "rss_check", (job) => ({
      ...job,
      is_running: true,
      last_message: `Checking ${evt.payload.feed_name}`,
      progress_current: evt.payload.current,
      progress_total: evt.payload.total,
    })),
  );
});

on("DownloadProgress", (qc, evt) => {
  qc.setQueryData<DownloadStatus[]>(animeKeys.downloads.queue(), evt.payload.downloads);
  qc.setQueryData<SystemStatus>(animeKeys.system.status(), (previousStatus) => {
    if (!previousStatus) {
      return previousStatus;
    }
    return {
      ...previousStatus,
      pending_downloads: evt.payload.downloads.length,
    };
  });
});

on("SystemStatus", (qc, evt) => {
  qc.setQueryData<SystemStatus>(animeKeys.system.status(), evt.payload);
});

// ScanProgress is intentionally a no-op
on("ScanProgress", () => {});

export function handleSocketEvent(queryClient: QueryClient, event: NotificationEvent) {
  const toastId = EVENT_TOAST_ID[event.type];
  const toastOptions = toastId ? { id: toastId } : undefined;
  const toastPreferenceKey = getNotificationPreferenceKeyForEvent(event);
  const notificationsEnabled =
    toastPreferenceKey === null || readNotificationPreferences()[toastPreferenceKey];

  const fns = handlers.get(event.type);
  if (!fns) return;

  const ctx: HandlerContext = { toastId, toastOptions, notificationsEnabled };
  for (const fn of fns) {
    fn(queryClient, event, ctx);
  }
}
