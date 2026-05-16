import type { Quality } from "@packages/shared/index.ts";

export interface ParsedReleaseName {
  readonly episodeNumber?: number | undefined;
  readonly episodeNumbers: readonly number[];
  readonly group?: string | undefined;
  readonly isBatch: boolean;
  readonly isSeaDex: boolean;
  readonly isSeaDexBest: boolean;
  readonly quality: Quality;
  readonly resolution?: string | undefined;
}

export interface RankedCurrentEpisode {
  readonly downloaded: boolean;
  readonly filePath?: string | undefined;
  readonly isSeaDex?: boolean | undefined;
  readonly isSeaDexBest?: boolean | undefined;
}

export interface RankedRelease {
  readonly group?: string | undefined;
  readonly isSeaDex: boolean;
  readonly isSeaDexBest: boolean;
  readonly seaDexDualAudio?: boolean | undefined;
  readonly seaDexNotes?: string | undefined;
  readonly seaDexTags?: readonly string[] | undefined;
  readonly remake: boolean;
  readonly seeders: number;
  readonly sizeBytes: number;
  readonly title: string;
  readonly trusted: boolean;
}
