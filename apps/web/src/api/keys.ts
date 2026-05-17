import type { MediaSeason } from "./contracts";

export const animeKeys = {
  all: ["media"] as const,
  lists: () => ["media", "list"] as const,
  detail: (id: number) => ["media", "detail", id] as const,
  unitScanTasks: {
    all: (mediaId: number) => ["media", "detail", mediaId, "scan-tasks"] as const,
    byId: (mediaId: number, taskId: number) =>
      ["media", "detail", mediaId, "scan-tasks", taskId] as const,
  },
  units: (id: number) => ["media", "detail", id, "units"] as const,
  files: (id: number) => ["media", "detail", id, "files"] as const,
  search: {
    query: (q: string) => ["media", "search", q] as const,
    units: (mediaId: number, unitNumber: number) =>
      ["search", "units", mediaId, unitNumber] as const,
    releases: (query: string, options?: { mediaId?: number; category?: string; filter?: string }) =>
      ["search", "releases", { query, ...options }] as const,
  },
  anilist: (id: number, mediaKind = "anime") => ["media", "anilist", mediaKind, id] as const,
  seasonal: (input?: {
    season?: MediaSeason | undefined;
    year?: number | undefined;
    limit?: number | undefined;
    page?: number | undefined;
  }) =>
    [
      "media",
      "seasonal",
      input?.season ?? null,
      input?.year ?? null,
      input?.limit ?? null,
      input?.page ?? null,
    ] as const,
  library: {
    all: ["library"] as const,
    importTasks: {
      all: () => ["library", "import", "tasks"] as const,
      byId: (taskId: number) => ["library", "import", "tasks", taskId] as const,
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
    events: (input?: {
      mediaId?: number;
      cursor?: string;
      downloadId?: number;
      direction?: "next" | "prev";
      endDate?: string;
      eventType?: string;
      limit?: number;
      startDate?: string;
      status?: string;
    }) => ["downloads", "events", input ?? {}] as const,
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
    },
    jobs: () => ["system", "jobs"] as const,
    status: () => ["system", "status"] as const,
    logs: (
      page: number,
      level?: string,
      eventType?: string,
      startDate?: string,
      endDate?: string,
    ) => ["system", "logs", { page, level, eventType, startDate, endDate }] as const,
  },
} as const satisfies Record<string, unknown>;
