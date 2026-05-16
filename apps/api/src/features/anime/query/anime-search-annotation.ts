import type { AnimeSearchResult } from "@packages/shared/index.ts";
import { scoreAnimeSearchResultMatch } from "@/domain/anime/derivations.ts";

export function annotateAnimeSearchResultsForQuery(
  query: string,
  results: readonly AnimeSearchResult[],
) {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return [...results];
  }

  return results.map((result) => {
    const confidence = roundConfidence(scoreAnimeSearchResultMatch(trimmed, result));

    return {
      ...result,
      match_confidence: confidence,
      match_reason: describeAnimeSearchMatch(trimmed, confidence),
    } satisfies AnimeSearchResult;
  });
}

function describeAnimeSearchMatch(query: string, confidence: number) {
  if (confidence >= 0.99) {
    return `Exact title match for ${JSON.stringify(query)}`;
  }

  if (confidence >= 0.8) {
    return `Strong title match for ${JSON.stringify(query)}`;
  }

  return `Partial title match for ${JSON.stringify(query)}`;
}

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}
