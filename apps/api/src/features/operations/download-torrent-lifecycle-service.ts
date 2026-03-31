import {
  makeDownloadTorrentActionSupport,
  type DownloadTorrentActionSupportShape,
} from "@/features/operations/download-torrent-action-support.ts";
import {
  makeDownloadTorrentSyncSupport,
  type DownloadTorrentSyncSupportInput,
  type DownloadTorrentSyncSupportShape,
} from "@/features/operations/download-torrent-sync-support.ts";

export type DownloadTorrentLifecycleServiceShape = DownloadTorrentActionSupportShape &
  DownloadTorrentSyncSupportShape;

export type DownloadTorrentLifecycleServiceInput = DownloadTorrentSyncSupportInput;

export function makeDownloadTorrentLifecycleService(input: DownloadTorrentLifecycleServiceInput) {
  const actionSupport = makeDownloadTorrentActionSupport(input);
  const syncSupport = makeDownloadTorrentSyncSupport(input);

  return {
    ...actionSupport,
    ...syncSupport,
  } satisfies DownloadTorrentLifecycleServiceShape;
}
