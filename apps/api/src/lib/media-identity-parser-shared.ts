export function isYearLike(num: number): boolean {
  return num >= 1900 && num <= 2100;
}

export function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function rangeArray(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function formatSeasonLabel(season: number, episodes: number[]): string {
  const s = String(season).padStart(2, "0");
  if (episodes.length === 1) {
    return `S${s}E${String(episodes[0]).padStart(2, "0")}`;
  }
  const sorted = [...episodes].sort((a, b) => a - b);
  const first = String(sorted[0]).padStart(2, "0");
  const last = String(sorted[sorted.length - 1]).padStart(2, "0");

  const isContiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (isContiguous) {
    return `S${s}E${first}-E${last}`;
  }
  return sorted.map((ep) => `S${s}E${String(ep).padStart(2, "0")}`).join("-");
}
