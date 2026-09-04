/** Derives the media season (winter/spring/summer/fall) from an ISO date string. */
export function deriveAnimeSeason(
  date?: string | null,
): "winter" | "spring" | "summer" | "fall" | undefined {
  const month = globalThis.Number.parseInt((date ?? "").split("-")[1] ?? "", 10);

  if (!globalThis.Number.isFinite(month) || month === 0) {
    return undefined;
  }

  if (month <= 3) return "winter";
  if (month <= 6) return "spring";
  if (month <= 9) return "summer";
  return "fall";
}

/** Extracts the 4-digit year from an ISO date string. */
export function extractYearFromDate(date?: string | null) {
  const year = globalThis.Number.parseInt((date ?? "").slice(0, 4), 10);
  return globalThis.Number.isFinite(year) && year > 0 ? year : undefined;
}
