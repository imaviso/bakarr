import type { PreferredTitle } from "../../../../../../packages/shared/src/index.ts";

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
  readonly animeImage?: string;
  readonly importedPath?: string;
}

export interface DownloadEventPresentationContext {
  readonly animeImage?: string;
  readonly animeTitle?: string;
  readonly torrentName?: string;
}
