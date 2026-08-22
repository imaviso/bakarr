import type { DownloadEventsFilterInput, MediaSeason } from "./contracts";

export const animeKeys = {
  all: ["media"] as const,
  lists: () => ["media", "list"] as const,
  detail: (id: number) => ["media", "detail", id] as const,
  unitScanTasks: {
    all: (mediaId: number) => ["media", "detail", mediaId, "scan-tasks"] as const,
    byId: (mediaId: number, taskId: number) =>
      ["media", "detail", mediaId, "scan-tasks", taskId] as const,
    pending: ["media", "detail", "scan-tasks", "pending"] as const,
  },
  units: (id: number) => ["media", "detail", id, "units"] as const,
  files: (id: number) => ["media", "detail", id, "files"] as const,
  search: {
    query: (query: string, mediaKind: string) => ["media", "search", { query, mediaKind }] as const,
    units: (mediaId: number, unitNumber: number) =>
      ["search", "units", mediaId, unitNumber] as const,
    releases: (query: string, options?: { mediaId?: number; category?: string; filter?: string }) =>
      ["search", "releases", { query, ...options }] as const,
  },
  anilist: (id: number, mediaKind = "anime") => ["media", "anilist", mediaKind, id] as const,
  seasonalInfinite: (input?: {
    season?: MediaSeason | undefined;
    year?: number | undefined;
    limit?: number | undefined;
  }) =>
    [
      "media",
      "seasonal",
      "infinite",
      {
        season: input?.season ?? null,
        year: input?.year ?? null,
        limit: input?.limit ?? 25,
      },
    ] as const,
  library: {
    all: ["library"] as const,
    importTasks: {
      all: () => ["library", "import", "tasks"] as const,
      byId: (taskId: number) => ["library", "import", "tasks", taskId] as const,
      pending: ["library", "import", "tasks", "pending"] as const,
    },
    stats: () => ["library", "stats"] as const,
    activity: () => ["library", "activity"] as const,
    unmapped: () => ["library", "unmapped"] as const,
  },
  downloads: {
    all: ["downloads"] as const,
    tasks: {
      all: () => ["downloads", "tasks"] as const,
      byId: (taskId: number) => ["downloads", "tasks", taskId] as const,
    },
    events: (input?: DownloadEventsFilterInput) => ["downloads", "events", input ?? {}] as const,
    queue: () => ["downloads", "queue"] as const,
    history: () => ["downloads", "history"] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    qualities: () => ["profiles", "qualities"] as const,
  },
  releaseProfiles: ["release-profiles"] as const,
  renamePreview: (id: number) => ["rename-preview", id] as const,
  rss: {
    all: ["rss"] as const,
    media: (id: number) => ["rss", "media", id] as const,
  },
  calendar: (start: string, end: string) => ["calendar", start, end] as const,
  wanted: (limit: number) => ["wanted", limit] as const,
  browse: (path: string, offset?: number, limit?: number) =>
    ["browse", path, { offset: offset ?? 0, limit: limit ?? 0 }] as const,
  auth: {
    me: () => ["auth", "me"] as const,
    apiKey: () => ["auth", "api-key"] as const,
  },
  system: {
    all: ["system"] as const,
    config: () => ["system", "config"] as const,
    dashboard: () => ["system", "dashboard"] as const,
    observability: () => ["system", "observability"] as const,
    tasks: {
      all: () => ["system", "tasks"] as const,
      byId: (taskId: number) => ["system", "tasks", taskId] as const,
      pending: ["system", "tasks", "pending"] as const,
    },
    jobs: () => ["system", "jobs"] as const,
    status: () => ["system", "status"] as const,
    logsInfinite: (input?: {
      level?: string | undefined;
      eventType?: string | undefined;
      startDate?: string | undefined;
      endDate?: string | undefined;
    }) =>
      [
        "system",
        "logs",
        "infinite",
        {
          level: input?.level,
          eventType: input?.eventType,
          startDate: input?.startDate,
          endDate: input?.endDate,
        },
      ] as const,
  },
} as const satisfies Record<string, unknown>;
