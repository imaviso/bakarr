import type { Quality } from "@packages/shared/index.ts";

export interface ParsedReleaseName {
  readonly episodeNumber?: number;
  readonly episodeNumbers: readonly number[];
  readonly group?: string;
  readonly isBatch: boolean;
  readonly isSeaDex: boolean;
  readonly isSeaDexBest: boolean;
  readonly quality: Quality;
  readonly resolution?: string;
}

export interface RankedCurrentEpisode {
  readonly downloaded: boolean;
  readonly filePath?: string;
  readonly isSeaDex?: boolean;
  readonly isSeaDexBest?: boolean;
}

export interface RankedRelease {
  readonly group?: string;
  readonly isSeaDex: boolean;
  readonly isSeaDexBest: boolean;
  readonly seaDexDualAudio?: boolean;
  readonly seaDexNotes?: string;
  readonly seaDexTags?: readonly string[];
  readonly remake: boolean;
  readonly seeders: number;
  readonly sizeBytes: number;
  readonly title: string;
  readonly trusted: boolean;
}
