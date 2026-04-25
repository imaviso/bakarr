import type { NamingInput } from "@/infra/naming.ts";
import type { NamingTitleSource, RenamePreviewMetadataSnapshot } from "@packages/shared/index.ts";

export interface ResolvedNamingPlan {
  readonly formatUsed: string;
  readonly fallbackUsed: boolean;
  readonly warnings: readonly string[];
  readonly missingFields: readonly string[];
}

export interface CanonicalEpisodeNamingInput {
  readonly namingInput: NamingInput;
  readonly warnings: readonly string[];
}

export interface EpisodeFilenamePlan {
  readonly baseName: string;
  readonly fallbackUsed: boolean;
  readonly formatUsed: string;
  readonly metadataSnapshot: RenamePreviewMetadataSnapshot;
  readonly missingFields: readonly string[];
  readonly warnings: readonly string[];
}

export interface SelectedAnimeTitleForNaming {
  readonly title: string;
  readonly source: NamingTitleSource;
}
