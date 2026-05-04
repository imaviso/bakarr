/** Derives the anime season (winter/spring/summer/fall) from an ISO date string. */
export function deriveAnimeSeason(date?: string | null) {
  const month = Number.parseInt((date ?? "").split("-")[1] ?? "", 10);

  if (!Number.isFinite(month) || month === 0) {
    return undefined;
  }

  if (month <= 3) return "winter" as const;
  if (month <= 6) return "spring" as const;
  if (month <= 9) return "summer" as const;
  return "fall" as const;
}

/** Extracts the 4-digit year from an ISO date string. */
export function extractYearFromDate(date?: string | null) {
  const year = Number.parseInt((date ?? "").slice(0, 4), 10);
  return Number.isFinite(year) && year > 0 ? year : undefined;
}
