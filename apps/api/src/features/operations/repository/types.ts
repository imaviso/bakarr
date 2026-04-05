import type { PreferredTitle } from "@packages/shared/index.ts";
export type { DownloadEventPresentationContext } from "@/lib/download-event-presentations.ts";

export interface CurrentEpisodeState {
  readonly downloaded: boolean;
  readonly filePath?: string;
}

export interface NamingSettings {
  readonly namingFormat: string;
  readonly movieNamingFormat: string;
  readonly preferredTitle: PreferredTitle;
}

export interface DownloadPresentationContext {
  readonly animeImage?: string | undefined;
  readonly importedPath?: string | undefined;
}
