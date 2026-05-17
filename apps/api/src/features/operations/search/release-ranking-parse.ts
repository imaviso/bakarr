import { parseReleaseSourceIdentity } from "@/infra/media/identity/identity.ts";
import {
  parseQualityFromTitle,
  parseResolution,
} from "@/features/operations/search/release-ranking-quality.ts";
import type { ParsedReleaseName } from "@/features/operations/search/release-ranking-types.ts";

export function parseReleaseName(title: string): ParsedReleaseName {
  const lower = title.toLowerCase();
  const groupMatch = title.match(/^\[(.*?)\]/);
  const resolution = parseResolution(title);
  const quality = parseQualityFromTitle(title);
  const batchTerms = [" batch", "complete", "全集", "season pack", "box", "collection"];
  const unitNumbers = parseUnitNumbersFromTitle(title);
  const seasonPack = looksLikeSeasonPack(title);

  return {
    unitNumber: unitNumbers[0],
    unitNumbers,
    group: groupMatch?.[1],
    isBatch:
      unitNumbers.length > 1 ||
      batchTerms.some((term) => lower.includes(term)) ||
      (unitNumbers.length === 0 && seasonPack),
    isSeaDex: false,
    isSeaDexBest: false,
    quality,
    resolution,
  };
}

export function parseUnitFromTitle(title: string): number | undefined {
  return parseUnitNumbersFromTitle(title)[0];
}

export function parseUnitNumbersFromTitle(title: string): readonly number[] {
  const result = parseReleaseSourceIdentity(title);
  if (!result.source_identity) return [];

  if (result.source_identity.scheme === "daily") {
    return [];
  }

  return result.source_identity.unit_numbers;
}

function looksLikeSeasonPack(title: string) {
  return [
    /(?:^|[\s._-])s(\d{1,2})(?![\s._-]*e\d)(?:[\s._-]|\(|\[|$)/i,
    /(?:^|[\s._-])season[\s._-]*(\d{1,2})(?![\s._-]*(?:e|ep|episode)\d)(?:[\s._-]|\(|\[|$)/i,
    /(?:^|[\s._-])(\d{1,2})(?:st|nd|rd|th)[\s._-]+season(?:[\s._-]|\(|\[|$)/i,
  ].some((pattern) => pattern.test(title));
}
