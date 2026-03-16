export const BACKGROUND_WORKER_NAMES = [
  "download_sync",
  "rss",
  "library_scan",
  "unmapped_scan",
] as const;

export type BackgroundWorkerName = (typeof BACKGROUND_WORKER_NAMES)[number];

export interface BackgroundWorkerStats {
  readonly daemonRunning: boolean;
  readonly failureCount: number;
  readonly lastErrorMessage: string | null;
  readonly lastFailedAt: string | null;
  readonly lastStartedAt: string | null;
  readonly lastSucceededAt: string | null;
  readonly runRunning: boolean;
  readonly skipCount: number;
  readonly successCount: number;
}

export type BackgroundWorkerSnapshot = Record<
  BackgroundWorkerName,
  BackgroundWorkerStats
>;

export function emptyBackgroundWorkerStats(): BackgroundWorkerStats {
  return {
    daemonRunning: false,
    failureCount: 0,
    lastErrorMessage: null,
    lastFailedAt: null,
    lastStartedAt: null,
    lastSucceededAt: null,
    runRunning: false,
    skipCount: 0,
    successCount: 0,
  };
}

export function initialBackgroundWorkerSnapshot(): BackgroundWorkerSnapshot {
  return {
    download_sync: emptyBackgroundWorkerStats(),
    library_scan: emptyBackgroundWorkerStats(),
    rss: emptyBackgroundWorkerStats(),
    unmapped_scan: emptyBackgroundWorkerStats(),
  };
}
