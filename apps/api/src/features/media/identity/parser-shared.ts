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

export function formatSeasonLabel(season: number, mediaUnits: number[]): string {
  const s = String(season).padStart(2, "0");
  const sorted = [...mediaUnits].toSorted((a, b) => a - b);
  const [firstEpisode] = sorted;
  if (firstEpisode === undefined) {
    return `S${s}`;
  }

  if (sorted.length === 1) {
    return `S${s}E${String(firstEpisode).padStart(2, "0")}`;
  }

  const lastEpisode = sorted[sorted.length - 1];
  if (lastEpisode === undefined) {
    return `S${s}E${String(firstEpisode).padStart(2, "0")}`;
  }

  const first = String(firstEpisode).padStart(2, "0");
  const last = String(lastEpisode).padStart(2, "0");

  const isContiguous = sorted.every((n, i) => {
    if (i === 0) {
      return true;
    }

    const previous = sorted[i - 1];
    return previous !== undefined && n === previous + 1;
  });
  if (isContiguous) {
    return `S${s}E${first}-E${last}`;
  }
  return sorted.map((ep) => `S${s}E${String(ep).padStart(2, "0")}`).join("-");
}
