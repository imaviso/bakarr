import type { ParsedEpisodeIdentity } from "@/lib/media-identity-model.ts";

export interface PathParseContext {
  entry_folder_title?: string;
  season_hint?: number;
  is_specials_folder?: boolean;
  sequel_hint?: string;
}

export type MediaArtifactKind = "episode" | "extra" | "sample" | "unknown";

export interface ParsedMediaFile {
  kind: MediaArtifactKind;
  parsed_title: string;
  source_identity?: ParsedEpisodeIdentity | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  skip_reason?: string | undefined;
}
