export type ReleaseFlagKind = "trusted" | "seadex" | "seadex_best" | "dual_audio" | "remake";

export interface ReleaseFlag {
  kind: ReleaseFlagKind;
  label: string;
}

interface ReleaseSourceLike {
  group?: string | null | undefined;
  indexer?: string | null | undefined;
  quality?: string | null | undefined;
  resolution?: string | null | undefined;
}

export function buildReleaseSourceSummaryInput(input?: ReleaseSourceLike) {
  return {
    ...(input?.group == null ? {} : { group: input.group }),
    ...(input?.indexer == null ? {} : { indexer: input.indexer }),
    ...(input?.quality == null ? {} : { quality: input.quality }),
    ...(input?.resolution == null ? {} : { resolution: input.resolution }),
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
  parsed_air_date?: string | null | undefined;
  parsed_unit_label?: string | null | undefined;
}) {
  if (
    input.parsed_unit_label &&
    input.parsed_air_date &&
    input.parsed_unit_label !== input.parsed_air_date
  ) {
    return `${input.parsed_unit_label} • ${input.parsed_air_date}`;
  }

  return input.parsed_unit_label ?? input.parsed_air_date;
}

export function getReleaseFlags(input: {
  is_seadex?: boolean | null | undefined;
  is_seadex_best?: boolean | null | undefined;
  remake?: boolean | null | undefined;
  seadex_dual_audio?: boolean | null | undefined;
  trusted?: boolean | null | undefined;
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
    default:
      return "border-border text-muted-foreground bg-muted";
  }
}
