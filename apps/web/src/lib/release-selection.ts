import type { DownloadAction, DownloadSelectionKind } from "@bakarr/shared";

export interface CompactSelectionMetadata {
  chosen_from_seadex?: boolean;
  previous_quality?: string;
  previous_score?: number;
  selection_kind: DownloadSelectionKind;
  selection_score?: number;
}

export interface SelectionDetailInput {
  previous_quality?: string;
  previous_score?: number;
  selection_score?: number;
}

export interface ReleaseConfidenceInput {
  is_seadex?: boolean;
  is_seadex_best?: boolean;
  remake?: boolean;
  trusted?: boolean;
}

export interface ReleaseConfidenceMetadata {
  label: string;
  reason: string;
  tone: "info" | "success" | "warning";
}

export function selectionKindLabel(kind?: DownloadSelectionKind) {
  if (kind === "upgrade") return "Upgrade";
  if (kind === "accept") return "Accepted";
  if (kind === "manual") return "Manual";
  return undefined;
}

export function selectionKindBadgeClass(kind?: DownloadSelectionKind) {
  if (kind === "upgrade") {
    return "bg-info/10 text-info border-transparent";
  }

  if (kind === "accept") {
    return "bg-success/10 text-success border-transparent";
  }

  return "bg-muted text-muted-foreground border-transparent";
}

export function selectionMetadataFromDownloadAction(
  action: DownloadAction,
): CompactSelectionMetadata {
  if (action.Upgrade) {
    return {
      chosen_from_seadex: action.Upgrade.is_seadex || undefined,
      previous_quality: action.Upgrade.old_quality.name,
      previous_score: action.Upgrade.old_score,
      selection_kind: "upgrade",
      selection_score: action.Upgrade.score,
    };
  }

  if (action.Accept) {
    return {
      chosen_from_seadex: action.Accept.is_seadex || undefined,
      selection_kind: "accept",
      selection_score: action.Accept.score,
    };
  }

  return { selection_kind: "manual" };
}

export function formatSelectionSummary(input: {
  previous_quality?: string;
  previous_score?: number;
  selection_kind?: DownloadSelectionKind;
  selection_score?: number;
}) {
  const label = selectionKindLabel(input.selection_kind);
  const detail = formatSelectionDetail(input);

  if (input.selection_kind === "manual" && !detail) {
    return undefined;
  }

  if (!label && !detail) {
    return undefined;
  }

  return [label, detail]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" • ");
}

export function formatSelectionDetail(input: SelectionDetailInput) {
  const parts = [
    typeof input.selection_score === "number" ? `score ${input.selection_score}` : undefined,
    input.previous_quality ? `from ${input.previous_quality}` : undefined,
    typeof input.previous_score === "number" ? `prev ${input.previous_score}` : undefined,
  ].filter((value) => typeof value === "string" && value.length > 0);

  return parts.length > 0 ? parts.join(" • ") : undefined;
}

export function getReleaseConfidence(
  input: ReleaseConfidenceInput,
): ReleaseConfidenceMetadata | undefined {
  if (input.is_seadex_best) {
    return {
      label: "High confidence",
      reason: "SeaDex Best release",
      tone: "success",
    };
  }

  if (input.is_seadex) {
    return {
      label: "Recommended",
      reason: "SeaDex recommended release",
      tone: "info",
    };
  }

  if (input.remake) {
    return {
      label: "Review",
      reason: "Marked as remake",
      tone: "warning",
    };
  }

  if (input.trusted) {
    return {
      label: "Trusted",
      reason: "Trusted uploader",
      tone: "info",
    };
  }

  return undefined;
}

export function releaseConfidenceBadgeClass(tone?: ReleaseConfidenceMetadata["tone"]) {
  if (tone === "success") {
    return "bg-success/10 text-success border-transparent";
  }

  if (tone === "warning") {
    return "bg-warning/10 text-warning border-transparent";
  }

  return "bg-info/10 text-info border-transparent";
}
