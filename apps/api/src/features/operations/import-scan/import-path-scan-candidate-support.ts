import type { AnimeSearchResult, ScannedFile } from "@packages/shared/index.ts";
import { scoreAnimeSearchResultMatch } from "@/domain/anime/derivations.ts";
import { titlesMatch } from "@/features/operations/library/library-import-analysis-support.ts";

export function enrichedEpisodeNumbers(
  files: readonly Pick<ScannedFile, "episode_number" | "episode_numbers">[],
) {
  return files.flatMap((file) => {
    if (file.episode_numbers?.length) {
      return file.episode_numbers;
    }

    return file.episode_number > 0 ? [file.episode_number] : [];
  });
}

export function findBestRemoteCandidate(
  parsedTitle: string,
  candidates: readonly AnimeSearchResult[],
) {
  let bestCandidate: AnimeSearchResult | undefined;
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
