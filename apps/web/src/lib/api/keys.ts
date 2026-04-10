export const animeKeys = {
  all: ["anime"] as const,
  lists: () => ["anime", "list"] as const,
  detail: (id: number) => ["anime", "detail", id] as const,
  episodes: (id: number) => ["anime", "detail", id, "episodes"] as const,
  files: (id: number) => ["anime", "detail", id, "files"] as const,
  search: {
    query: (q: string) => ["anime", "search", q] as const,
    episode: (animeId: number, episodeNumber: number) =>
      ["search", "episode", animeId, episodeNumber] as const,
    releases: (query: string, options?: { animeId?: number; category?: string; filter?: string }) =>
      ["search", "releases", { query, ...options }] as const,
  },
  anilist: (id: number) => ["anime", "anilist", id] as const,
  library: {
    all: ["library"] as const,
    stats: () => ["library", "stats"] as const,
    activity: () => ["library", "activity"] as const,
    unmapped: () => ["library", "unmapped"] as const,
  },
  downloads: {
    all: ["downloads"] as const,
    events: (input?: {
      animeId?: number;
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
    anime: (id: number) => ["rss", "anime", id] as const,
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
