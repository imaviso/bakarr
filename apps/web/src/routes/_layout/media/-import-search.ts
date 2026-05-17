function parseAnimeId(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  if (!/^[1-9]\d*$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseImportSearch(search: Record<string, unknown>) {
  const mediaId = parseAnimeId(search["mediaId"]);
  return mediaId === undefined ? {} : { mediaId };
}
