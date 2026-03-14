export function parseEpisodeNumber(path: string): number | undefined {
  const filename = path.split("/").pop() ?? path;

  // Pattern 1: Explicit episode markers (E01, EP01, Episode 01, - 01 -)
  let match = filename.match(
    /(?:^|[\s._-])(?:e|ep|episode)[\s._-]*(\d{1,4})(?:v\d+)?(?:[\s._-]|$)/i,
  );
  if (match) return Number(match[1]);

  // Pattern 2: Number in brackets/parentheses after title [GroupName] Title - 01 [1080p]
  match = filename.match(/\][\s._-]*(\d{1,4})(?:v\d+)?[\s._-]*(?:\[|$)/);
  if (match) {
    const num = Number(match[1]);
    if (num > 0 && num < 2000) return num;
  }

  // Pattern 3: Standalone number after title separator (Title - 01, Title_01.mkv)
  match = filename.match(/[\s._-](\d{1,4})(?:v\d+)?[\s._-]*\.[a-zA-Z]+$/);
  if (match) {
    const num = Number(match[1]);
    if (num > 0 && num < 2000) return num;
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
    const num = Number(numMatch[1]);
    // Skip years and very large numbers
    if (num > 0 && num < 2000 && (num < 1900 || num > 2100)) {
      candidates.push(num);
    }
  }

  // Prefer numbers closer to the end of the filename (usually the episode number)
  if (candidates.length > 0) {
    return candidates[candidates.length - 1];
  }

  return undefined;
}
