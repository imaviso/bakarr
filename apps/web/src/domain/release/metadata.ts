export type ReleaseFlagKind = "trusted" | "seadex" | "seadex_best" | "dual_audio" | "remake";

export interface ReleaseFlag {
  kind: ReleaseFlagKind;
  label: string;
}

interface ReleaseSourceLike {
  group?: string | undefined;
  indexer?: string | undefined;
  quality?: string | undefined;
  resolution?: string | undefined;
}

export function buildReleaseSourceSummaryInput(input?: ReleaseSourceLike) {
  return {
    ...(input?.group === undefined ? {} : { group: input.group }),
    ...(input?.indexer === undefined ? {} : { indexer: input.indexer }),
    ...(input?.quality === undefined ? {} : { quality: input.quality }),
    ...(input?.resolution === undefined ? {} : { resolution: input.resolution }),
  };
}

export function formatReleaseSourceSummary(input: ReleaseSourceLike) {
  const combinedQuality =
    input.quality && input.resolution && input.quality.includes(input.resolution)
      ? input.quality
      : [input.quality, input.resolution]
          .filter((value) => typeof value === "string" && value.length > 0)
          .join(" ") || undefined;

  const parts = [input.group, input.indexer, combinedQuality].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return parts.length > 0 ? parts.join(" • ") : undefined;
}

export function formatReleaseParsedSummary(input: {
  parsed_air_date?: string | undefined;
  parsed_episode_label?: string | undefined;
}) {
  if (
    input.parsed_episode_label &&
    input.parsed_air_date &&
    input.parsed_episode_label !== input.parsed_air_date
  ) {
    return `${input.parsed_episode_label} • ${input.parsed_air_date}`;
  }

  return input.parsed_episode_label ?? input.parsed_air_date;
}

export function getReleaseFlags(input: {
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  remake?: boolean | undefined;
  seadex_dual_audio?: boolean | undefined;
  trusted?: boolean | undefined;
}) {
  const flags: ReleaseFlag[] = [];

  if (input.trusted) {
    flags.push({ kind: "trusted", label: "Trusted" });
  }

  if (input.is_seadex_best) {
    flags.push({ kind: "seadex_best", label: "SeaDex Best" });
  } else if (input.is_seadex) {
    flags.push({ kind: "seadex", label: "SeaDex" });
  }

  if (input.seadex_dual_audio) {
    flags.push({ kind: "dual_audio", label: "Dual Audio" });
  }

  if (input.remake) {
    flags.push({ kind: "remake", label: "Remake" });
  }

  return flags;
}

export function releaseFlagBadgeClass(kind: ReleaseFlagKind) {
  switch (kind) {
    case "trusted":
      return "border-success/20 text-success bg-success/5";
    case "seadex_best":
      return "border-warning/20 text-warning bg-warning/5";
    case "seadex":
      return "border-info/20 text-info bg-info/5";
    case "dual_audio":
      return "border-primary/20 text-primary bg-primary/10";
    case "remake":
      return "border-warning/20 text-warning bg-warning/5";
  }

  return "border-border text-muted-foreground bg-muted";
}
