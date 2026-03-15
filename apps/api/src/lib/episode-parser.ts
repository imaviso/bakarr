export function parseEpisodeNumbers(path: string): readonly number[] {
  const filename = path.split("/").pop() ?? path;
  const extensionless = filename.replace(/\.[^.]+$/, "");

  const range = parseEpisodeRange(extensionless);
  if (range.length > 0) {
    return range;
  }

  // Pattern 1: Common TV/Sonarr/Plex markers (S01E01, 1x01, Season 1 Episode 1)
  let match = extensionless.match(
    /(?:^|[\s._-])s\d{1,2}[\s._-]*e(\d{1,3})(?:[\s._-]*e?\d{1,3})*(?:[\s._-]|$)/i,
  );
  if (match) return toEpisodeList(match[1]);

  match = extensionless.match(
    /(?:^|[\s._-])\d{1,2}x(\d{1,3})(?:[\s._-](?:\d{1,2}x)?\d{1,3})*(?:[\s._-]|$)/i,
  );
  if (match) return toEpisodeList(match[1]);

  match = extensionless.match(
    /(?:^|[\s._-])season[\s._-]*\d{1,2}[\s._-]*(?:ep|e|episode)[\s._-]*(\d{1,3})(?:[\s._-]|$)/i,
  );
  if (match) return toEpisodeList(match[1]);

  // Pattern 2: Explicit episode markers (E01, EP01, Episode 01)
  match = extensionless.match(
    /(?:^|[\s._-])(?:e|ep|episode)[\s._-]*(\d{1,4})(?:v\d+)?(?:[\s._-]|$)/i,
  );
  if (match) return toEpisodeList(match[1]);

  // Pattern 3: Number in brackets/parentheses after title [GroupName] Title - 01 [1080p]
  match = filename.match(/\][\s._-]*(\d{1,4})(?:v\d+)?[\s._-]*(?:\[|$)/);
  if (match) {
    const numbers = toEpisodeList(match[1]);
    if (numbers.length > 0) return numbers;
  }

  // Pattern 4: Standalone number after title separator (Title - 01, Title_01.mkv)
  match = filename.match(/[\s._-](\d{1,4})(?:v\d+)?[\s._-]*\.[a-zA-Z]+$/);
  if (match) {
    const numbers = toEpisodeList(match[1]);
    if (numbers.length > 0) return numbers;
  }

  // Clean filename for fallback matching
  const cleanFilename = filename
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/(?:480|720|1080|2160)[pi]/gi, "")
    .replace(/[hx]26[45]/gi, "")
    .replace(/[._-]/g, " ");

  // Find all number candidates
  const candidates: number[] = [];
  const numberPattern = /\b(\d{1,4})\b/g;
  let numMatch: RegExpExecArray | null;
  while ((numMatch = numberPattern.exec(cleanFilename)) !== null) {
    const num = toEpisodeNumber(numMatch[1]);
    // Skip years and very large numbers
    if (num !== undefined && (num < 1900 || num > 2100)) {
      candidates.push(num);
    }
  }

  // Prefer numbers closer to the end of the filename (usually the episode number)
  if (candidates.length > 0) {
    return [candidates[candidates.length - 1]];
  }

  return [];
}

export function parseEpisodeNumber(path: string): number | undefined {
  return parseEpisodeNumbers(path)[0];
}

function parseEpisodeRange(value: string): readonly number[] {
  const patterns = [
    /s\d{1,2}[\s._-]*e(\d{1,3})\s*[-~]\s*(?:s\d{1,2}[\s._-]*)?e?(\d{1,3})(?:[^0-9]|$)/i,
    /\d{1,2}x(\d{1,3})\s*[-~]\s*(?:\d{1,2}x)?(\d{1,3})(?:[^0-9]|$)/i,
    /(?:^|[^a-z0-9])(?:e|ep|episode)[\s._-]*(\d{1,3})\s*[-~]\s*(?:e|ep|episode)?[\s._-]*(\d{1,3})(?:[^a-z0-9]|$)/i,
    /(?:^|[^0-9])(\d{1,3})\s*[-~]\s*(\d{1,3})(?:[^0-9]|$)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (!match) {
      continue;
    }

    const start = toEpisodeNumber(match[1]);
    const end = toEpisodeNumber(match[2]);

    if (
      start === undefined || end === undefined || end < start ||
      end - start > 500
    ) {
      continue;
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  return [];
}

function toEpisodeNumber(value: string): number | undefined {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 && num < 2000 ? num : undefined;
}

function toEpisodeList(value: string): readonly number[] {
  const num = toEpisodeNumber(value);
  return num === undefined ? [] : [num];
}
