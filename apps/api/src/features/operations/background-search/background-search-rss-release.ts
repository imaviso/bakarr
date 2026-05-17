import { parseUnitNumbersFromTitle } from "@/features/operations/search/release-ranking.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";

export function parseRssReleaseUnitNumbers(input: {
  readonly mediaKind: string;
  readonly title: string;
}): readonly number[] {
  if (input.mediaKind === "anime") {
    return parseUnitNumbersFromTitle(input.title);
  }

  return parseVolumeNumbersFromTitle(input.title);
}
