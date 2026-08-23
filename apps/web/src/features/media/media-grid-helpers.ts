import type { Media } from "@/api/contracts";
import {
  mediaUnitKindFromMediaKind,
  mediaUnitLabel,
  mediaUnitShortLabel,
} from "@/domain/media-unit";

export const GRID_GAP_PX = 16;
export const MIN_CARD_WIDTH_PX = 220;
export const MAX_GRID_COLUMNS = 6;

export function getColCount(w: number) {
  const safeWidth = Math.max(0, w);
  const cols = Math.floor((safeWidth + GRID_GAP_PX) / (MIN_CARD_WIDTH_PX + GRID_GAP_PX));
  return Math.min(MAX_GRID_COLUMNS, Math.max(1, cols));
}

export function progressPercent(media: Media) {
  return media.progress.downloaded_percent ?? null;
}

export function progressSummary(media: Media) {
  const total = media.progress.total;
  const percent = media.progress.downloaded_percent;

  if (total) {
    return percent !== undefined
      ? `${media.progress.downloaded}/${total} downloaded • ${percent}%`
      : `${media.progress.downloaded}/${total} downloaded`;
  }

  return `${media.progress.downloaded} downloaded`;
}

export function nextProgressLabel(media: Media) {
  const unitKind = mediaUnitKindFromMediaKind(media.media_kind);

  if (media.progress.is_up_to_date) {
    return "Up to date";
  }

  if (media.progress.next_missing_unit) {
    return `Next missing: ${mediaUnitShortLabel(unitKind, media.progress.next_missing_unit)}`;
  }

  if (media.progress.latest_downloaded_unit) {
    return `Latest: ${mediaUnitShortLabel(unitKind, media.progress.latest_downloaded_unit)}`;
  }

  return media.progress.downloaded > 0
    ? `${mediaUnitLabel(unitKind, 2)} available`
    : "No downloads yet";
}

export function statusTone(media: Media) {
  if (media.next_airing_unit) return "default" as const;
  if (media.progress.is_up_to_date) return "secondary" as const;
  if (media.progress.next_missing_unit) return "destructive" as const;
  return media.monitored ? ("outline" as const) : ("secondary" as const);
}
