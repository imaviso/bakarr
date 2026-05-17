import type { MediaSearchResult, ScannedFile } from "@packages/shared/index.ts";
import { scoreAnimeSearchResultMatch } from "@/domain/media/derivations.ts";
import { titlesMatch } from "@/features/operations/library/library-import-analysis-support.ts";

export function enrichedEpisodeNumbers(
  files: readonly Pick<ScannedFile, "unit_number" | "unit_numbers">[],
) {
  return files.flatMap((file) => {
    if (file.unit_numbers?.length) {
      return file.unit_numbers;
    }

    return file.unit_number > 0 ? [file.unit_number] : [];
  });
}

export function findBestRemoteCandidate(
  parsedTitle: string,
  candidates: readonly MediaSearchResult[],
) {
  let bestCandidate: MediaSearchResult | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (candidate.already_in_library || !titlesMatch(parsedTitle, candidate)) {
      continue;
    }

    const score = scoreAnimeSearchResultMatch(parsedTitle, candidate);
    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate
    ? { candidate: bestCandidate, confidence: roundConfidence(bestScore) }
    : undefined;
}

export function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}
