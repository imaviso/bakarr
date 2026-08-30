import { AbsoluteEpisodeIdentity } from "@/features/media/identity/model.ts";
import { isYearLike, rangeArray } from "@/features/media/identity/parser-shared.ts";

export function parseAbsoluteIdentity(
  extensionless: string,
  filename: string,
  options?: {
    readonly avoidSeasonOnlyFallback?: boolean;
  },
): AbsoluteEpisodeIdentity | undefined {
  const epMatch = extensionless.match(
    /(?:^|[\s._\-[(])(?:e|ep|episode)[\s._-]*(\d{1,4})(?:v\d+)?(?:[\s._\-\])]|$)/i,
  );
  if (epMatch) {
    const num = Number(epMatch[1]);
    if (num > 0 && num < 2000) {
      return new AbsoluteEpisodeIdentity({
        scheme: "absolute",
        unit_numbers: [num],
        label: String(num).padStart(2, "0"),
      });
    }
  }

  const bracketNumberMatch = filename.match(/\[(\d{1,4})(?:v\d+)?\]/);
  if (bracketNumberMatch) {
    const num = Number(bracketNumberMatch[1]);
    if (num > 0 && num < 2000 && !isYearLike(num)) {
      return new AbsoluteEpisodeIdentity({
        scheme: "absolute",
        unit_numbers: [num],
        label: String(num).padStart(2, "0"),
      });
    }
  }

  const bracketMatch = filename.match(/\][\s._-]*(\d{1,4})(?:v\d+)?[\s._-]*(?:\[|$)/);
  if (bracketMatch) {
    const num = Number(bracketMatch[1]);
    if (num > 0 && num < 2000) {
      return new AbsoluteEpisodeIdentity({
        scheme: "absolute",
        unit_numbers: [num],
        label: String(num).padStart(2, "0"),
      });
    }
  }

  const rangeResult = parseAbsoluteRange(extensionless);
  if (rangeResult) {
    return rangeResult;
  }

  const standaloneMatch = filename.match(/[\s._-](\d{1,4})(?:v\d+)?[\s._-]*\.[a-zA-Z]+$/);
  if (standaloneMatch) {
    const num = Number(standaloneMatch[1]);
    if (num > 0 && num < 2000 && !isYearLike(num)) {
      if (options?.avoidSeasonOnlyFallback && looksLikeSeasonOnlyNumber(extensionless, num)) {
        return undefined;
      }

      return new AbsoluteEpisodeIdentity({
        scheme: "absolute",
        unit_numbers: [num],
        label: String(num).padStart(2, "0"),
      });
    }
  }

  const cleanFilename = filename
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/(?:480|720|1080|2160)[pi]/gi, "")
    .replace(/[hx]26[45]/gi, "")
    .replace(/\b(?:8|10|12)[ .-]*bit\b/gi, "")
    .replace(/\b(?:aac|flac|opus|ac3|eac3|ddp|truehd|dts(?:-hd)?)[ .-]*[1-9](?:[ .][0-9])?\b/gi, "")
    .replace(/\b[1-9]\.[0-9](?:\s*ch)?\b/gi, "")
    .replace(/[._-]/g, " ");

  const candidates: number[] = [];
  const numberPattern = /\b(\d{1,4})\b/g;
  let numMatch: RegExpExecArray | null;
  while ((numMatch = numberPattern.exec(cleanFilename)) !== null) {
    const num = Number(numMatch[1]);
    if (num > 0 && num < 2000 && !isYearLike(num)) {
      candidates.push(num);
    }
  }

  if (candidates.length > 0) {
    const num = candidates[candidates.length - 1];
    if (num === undefined) {
      return undefined;
    }

    if (options?.avoidSeasonOnlyFallback && looksLikeSeasonOnlyNumber(extensionless, num)) {
      return undefined;
    }

    return new AbsoluteEpisodeIdentity({
      scheme: "absolute",
      unit_numbers: [num],
      label: String(num).padStart(2, "0"),
    });
  }

  return undefined;
}

function looksLikeSeasonOnlyNumber(value: string, number: number) {
  return [
    new RegExp(`(?:^|[\\s._-])s0*${number}(?![\\s._-]*e\\d)(?:[\\s._-]|\\(|\\[|$)`, "i"),
    new RegExp(
      `(?:^|[\\s._-])season[\\s._-]*0*${number}(?![\\s._-]*(?:e|ep|episode)\\d)(?:[\\s._-]|\\(|\\[|$)`,
      "i",
    ),
    new RegExp(
      `(?:^|[\\s._-])0*${number}(?:st|nd|rd|th)[\\s._-]+season(?:[\\s._-]|\\(|\\[|$)`,
      "i",
    ),
  ].some((pattern) => pattern.test(value));
}

function parseAbsoluteRange(value: string): AbsoluteEpisodeIdentity | undefined {
  if (/s\d{1,2}[\s._-]*e/i.test(value)) return undefined;

  const rangePatterns = [
    /\[(\d{1,3})\s*[-~]\s*(\d{1,3})\]/,
    /(?:^|[\s._-])(?:e|ep)[\s._-]*(\d{1,3})\s*[-~]\s*(?:e|ep)?[\s._-]*(\d{1,3})(?:[\s._-]|$)/i,
    /(?:^|[\s._\-[(])(\d{1,3})\s*[-~]\s*(\d{1,3})(?:[\s._\-\])]|$)/,
  ];

  for (const pattern of rangePatterns) {
    const match = value.match(pattern);
    if (!match || match.index === undefined) continue;

    // Avoid misparsing title trailing number + episode as range
    // e.g. "Otomege ... desu 2 - 03 - [1080p]" should be single 03, not 02-03
    const isGenericRangePattern =
      pattern.source.startsWith("(?:^|[") && !pattern.source.includes("e|ep");
    if (isGenericRangePattern && match[1] !== undefined && match[1].length <= 2) {
      const before = value.slice(0, match.index);
      if (/[a-zA-Z]\s*$/.test(before)) {
        const lastWord =
          before
            .trim()
            .split(/[\s._-]+/)
            .pop() ?? "";
        if (!/^(?:e|ep|episode|s|season)$/i.test(lastWord) && /\s-\s/.test(match[0])) {
          continue;
        }
      }
    }

    const start = Number(match[1]);
    const end = Number(match[2]);

    if (
      start > 0 &&
      end > 0 &&
      end >= start &&
      end < 2000 &&
      end - start <= 500 &&
      !isYearLike(start) &&
      !isYearLike(end)
    ) {
      if (start <= 12 && end <= 31 && end - start > 5) {
        if (/(?:19|20)\d{2}/.test(value)) {
          continue;
        }
      }

      const eps = rangeArray(start, end);
      return new AbsoluteEpisodeIdentity({
        scheme: "absolute",
        unit_numbers: eps,
        label:
          eps.length === 1
            ? String(eps[0]).padStart(2, "0")
            : `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`,
      });
    }
  }

  return undefined;
}
