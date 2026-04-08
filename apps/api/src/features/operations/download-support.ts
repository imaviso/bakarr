import type { Config } from "@packages/shared/index.ts";

export {
  ImportFileError,
  importDownloadedFile,
} from "@/features/operations/download-file-import-support.ts";
export {
  UpsertEpisodeFileError,
  upsertEpisodeFile,
  upsertEpisodeFilesAtomic,
} from "@/features/operations/download-episode-upsert-support.ts";

export function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

export function shouldRemoveTorrentOnImport(config: Config | null | undefined) {
  return config?.downloads.remove_torrent_on_import ?? true;
}

export function shouldDeleteImportedData(config: Config | null | undefined) {
  return config?.downloads.delete_download_files_after_import ?? false;
}
