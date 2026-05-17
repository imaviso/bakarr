import type { MediaSeason } from "~/api/contracts";

export interface SeasonWindow {
  season: MediaSeason;
  year: number;
}

const SEASONS: readonly MediaSeason[] = ["winter", "spring", "summer", "fall"] as const;

const SEASON_LABELS: Record<MediaSeason, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

/** Returns the season window for the given date (defaults to now). */
export function getCurrentSeasonWindow(now?: Date): SeasonWindow {
  const current = now ?? new Date();
  const month = current.getMonth() + 1;
  const season: MediaSeason =
    month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "fall";

  return {
    season,
    year: month === 12 ? current.getFullYear() + 1 : current.getFullYear(),
  };
}

/** Shift a season window by `delta` seasons (positive = forward, negative = backward).
 * Wraps correctly: fall +1 → winter (next year), winter -1 → fall (previous year). */
export function shiftSeasonWindow(window: SeasonWindow, delta: number): SeasonWindow {
  if (delta === 0) return { ...window };
  const idx = SEASONS.indexOf(window.season);
  const raw = idx + delta;
  // Compute season index and year offset
  const seasonIdx = ((raw % 4) + 4) % 4;
  const yearShift = Math.floor(raw / 4);
  // Negative raw with non-exact division needs adjustment when raw < 0
  const year = window.year + yearShift;
  return { season: SEASONS[seasonIdx]!, year };
}

/** Format a season window as a human-readable label, e.g. "Winter 2026". */
export function formatSeasonWindowLabel(window: SeasonWindow): string {
  return `${SEASON_LABELS[window.season]} ${window.year}`;
}
