import type { NotificationEvent } from "@bakarr/shared";

export const NOTIFICATION_PREFERENCE_KEYS = [
  "account",
  "download",
  "error",
  "import",
  "info",
  "library_scan",
  "refresh",
  "rename",
  "rss_check",
  "scan",
  "scan_folder",
  "search_missing",
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];

export const NOTIFICATION_PREFERENCE_OPTIONS = {
  account: {
    description: "Password and API key security updates.",
    label: "Account",
  },
  download: {
    description: "Download start and finish updates.",
    label: "Downloads",
  },
  error: {
    description: "System error notifications.",
    label: "Errors",
  },
  import: {
    description: "Library import progress and completion updates.",
    label: "Imports",
  },
  info: {
    description: "General informational messages.",
    label: "Info",
  },
  library_scan: {
    description: "Library folder scan job updates.",
    label: "Library Scan",
  },
  refresh: {
    description: "Metadata refresh updates.",
    label: "Metadata Refresh",
  },
  rename: {
    description: "Rename operation updates.",
    label: "Rename",
  },
  rss_check: {
    description: "RSS check start and finish updates.",
    label: "RSS Check",
  },
  scan: {
    description: "System scan task updates.",
    label: "Scan",
  },
  scan_folder: {
    description: "Folder scan operation updates.",
    label: "Scan Folder",
  },
  search_missing: {
    description: "Missing episode search updates.",
    label: "Search Missing",
  },
} as const;

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

const NOTIFICATION_PREFERENCES_STORAGE_KEY = "bakarr_notification_preferences";

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  account: true,
  download: true,
  error: true,
  import: true,
  info: true,
  library_scan: true,
  refresh: true,
  rename: true,
  rss_check: true,
  scan: true,
  scan_folder: true,
  search_missing: true,
};

let cachedPreferences: NotificationPreferences | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeNotificationPreferences(input: unknown): NotificationPreferences {
  const record = isRecord(input) ? input : undefined;

  const normalized: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  };

  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    const value = record?.[key];
    if (typeof value === "boolean") {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function readNotificationPreferences(): NotificationPreferences {
  if (cachedPreferences) {
    return cachedPreferences;
  }

  if (typeof window === "undefined") {
    cachedPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    return cachedPreferences;
  }

  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      cachedPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
      return cachedPreferences;
    }

    cachedPreferences = normalizeNotificationPreferences(JSON.parse(raw));
    return cachedPreferences;
  } catch {
    cachedPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    return cachedPreferences;
  }
}

export function writeNotificationPreferences(preferences: NotificationPreferences) {
  const normalized = normalizeNotificationPreferences(preferences);
  cachedPreferences = normalized;

  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore persistence errors.
  }
}

export function getNotificationPreferenceKeyForEvent(
  event: NotificationEvent,
): NotificationPreferenceKey | null {
  switch (event.type) {
    case "ScanStarted":
    case "ScanFinished":
      return "scan";
    case "DownloadStarted":
    case "DownloadFinished":
      return "download";
    case "RefreshStarted":
    case "RefreshFinished":
      return "refresh";
    case "SearchMissingStarted":
    case "SearchMissingFinished":
      return "search_missing";
    case "ScanFolderStarted":
    case "ScanFolderFinished":
      return "scan_folder";
    case "RenameStarted":
    case "RenameFinished":
      return "rename";
    case "ImportStarted":
    case "ImportFinished":
      return "import";
    case "LibraryScanStarted":
    case "LibraryScanFinished":
      return "library_scan";
    case "RssCheckStarted":
    case "RssCheckFinished":
      return "rss_check";
    case "PasswordChanged":
    case "ApiKeyRegenerated":
      return "account";
    case "Error":
      return "error";
    case "Info":
      return "info";
    case "ScanProgress":
    case "LibraryScanProgress":
    case "RssCheckProgress":
    case "DownloadProgress":
    case "SystemStatus":
      return null;
  }
}
