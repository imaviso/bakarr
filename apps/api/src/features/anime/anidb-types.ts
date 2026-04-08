export interface AniDbEpisodeLookupInput {
  readonly episodeCount?: number | undefined;
  readonly synonyms?: ReadonlyArray<string> | undefined;
  readonly title: {
    readonly english?: string | undefined;
    readonly native?: string | undefined;
    readonly romaji: string;
  };
}

export interface AniDbEpisodeMetadata {
  readonly aired?: string | undefined;
  readonly number: number;
  readonly title?: string | undefined;
}

export type AniDbLookupSkipReason =
  | "runtime_config_unavailable"
  | "disabled"
  | "missing_credentials"
  | "missing_title_candidates"
  | "title_not_found";

export type AniDbEpisodeLookupResult =
  | {
      readonly _tag: "AniDbLookupSuccess";
      readonly episodes: ReadonlyArray<AniDbEpisodeMetadata>;
    }
  | {
      readonly _tag: "AniDbLookupSkipped";
      readonly reason: AniDbLookupSkipReason;
    };
