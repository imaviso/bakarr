import type { AnimeSearchResult, Episode } from "@packages/shared/index.ts";

export function deriveEpisodeTimelineMetadata(
  aired?: string,
  now?: Date,
): Pick<Episode, "airing_status" | "is_future"> {
  if (!aired) {
    return { airing_status: "unknown", is_future: undefined };
  }

  if (!now) {
    return { airing_status: "unknown", is_future: undefined };
  }

  const airedAt = new Date(aired);
  if (Number.isNaN(airedAt.getTime())) {
    return { airing_status: "unknown", is_future: undefined };
  }

  if (airedAt > now) {
    return {
      airing_status: "future",
      is_future: true,
    };
  }

  return {
    airing_status: "aired",
    is_future: false,
  };
}

export function summarizeEpisodeCoverage(input: {
  airDate?: string;
  episodeNumbers?: readonly number[];
}) {
  if (input.airDate) {
    return `Air date ${input.airDate}`;
  }

  const episodeNumbers = [...new Set(input.episodeNumbers ?? [])]
    .filter((value) => Number.isFinite(value) && value > 0)
    .toSorted((left, right) => left - right);

  if (episodeNumbers.length <= 1) {
    return undefined;
  }

  const isContiguous = episodeNumbers.every((value, index) => {
    if (index === 0) {
      return true;
    }

    const previous = episodeNumbers[index - 1];
    return previous !== undefined && value === previous + 1;
  });

  if (isContiguous) {
    return `Episodes ${episodeNumbers[0]}-${episodeNumbers[episodeNumbers.length - 1]}`;
  }

  return `Episodes ${episodeNumbers.join(", ")}`;
}

export function inferAiredAt(
  status: string,
  episodeNumber: number,
  episodeCount: number | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule?: ReadonlyMap<number, string>,
  fallbackNowIso?: string,
) {
  const scheduledAiringAt = futureAiringSchedule?.get(episodeNumber);

  if (scheduledAiringAt) {
    return scheduledAiringAt;
  }

  const inferredFromSchedule = inferFromNearestScheduledEpisode(
    episodeNumber,
    futureAiringSchedule,
  );

  if (inferredFromSchedule) {
    return inferredFromSchedule;
  }

  if (!startDate) {
    return status === "FINISHED" ? (fallbackNowIso ?? null) : null;
  }

  const start = new Date(`${startDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime())) {
    return status === "FINISHED" ? (fallbackNowIso ?? null) : null;
  }

  if (status === "FINISHED" && endDate && episodeCount && episodeCount > 1) {
    const end = new Date(`${endDate}T00:00:00Z`);

    if (!Number.isNaN(end.getTime())) {
      const spanMs = Math.max(end.getTime() - start.getTime(), 0);
      const intervalMs = episodeCount > 1 ? Math.floor(spanMs / (episodeCount - 1)) : 0;
      return new Date(start.getTime() + intervalMs * (episodeNumber - 1)).toISOString();
    }
  }

  const weeklyMs = 7 * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() + weeklyMs * (episodeNumber - 1)).toISOString();
}

function inferFromNearestScheduledEpisode(
  episodeNumber: number,
  futureAiringSchedule: ReadonlyMap<number, string> | undefined,
) {
  if (!futureAiringSchedule || futureAiringSchedule.size === 0) {
    return null;
  }

  let nearest:
    | {
        readonly airingAt: number;
        readonly episode: number;
      }
    | undefined;

  for (const [scheduledEpisode, scheduledAiringAt] of futureAiringSchedule) {
    const scheduledTime = Date.parse(scheduledAiringAt);

    if (!Number.isFinite(scheduledTime)) {
      continue;
    }

    if (
      nearest === undefined ||
      Math.abs(scheduledEpisode - episodeNumber) < Math.abs(nearest.episode - episodeNumber)
    ) {
      nearest = {
        airingAt: scheduledTime,
        episode: scheduledEpisode,
      };
    }
  }

  if (!nearest) {
    return null;
  }

  const weeklyMs = 7 * 24 * 60 * 60 * 1000;
  const offset = episodeNumber - nearest.episode;
  return new Date(nearest.airingAt + offset * weeklyMs).toISOString();
}

export function scoreAnimeSearchResultMatch(
  parsedTitle: string,
  candidate: Pick<AnimeSearchResult, "title" | "synonyms">,
) {
  const target = normalizeTitle(parsedTitle);
  const titles = [
    candidate.title.romaji,
    candidate.title.english,
    candidate.title.native,
    ...(candidate.synonyms ?? []),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return titles.length === 0
    ? 0
    : Math.max(...titles.map((title) => scoreTitleMatch(target, normalizeTitle(title))));
}

function normalizeTitle(value: string) {
  return romanToArabic(
    value
      .toLowerCase()
      .replace(/\((19|20)\d{2}\)/g, " ")
      .replace(/\b(?:the|season|part|cour|ova|ona|tv|movie|special)\b/g, " ")
      .replace(/\biii\b/g, " 3 ")
      .replace(/\bii\b/g, " 2 ")
      .replace(/\biiii\b/g, " 4 ")
      .replace(/\biv\b/g, " 4 ")
      .replace(/\bvi\b/g, " 6 ")
      .replace(/\bv\b/g, " 5 ")
      .replace(/\bx\b/g, " x ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function romanToArabic(value: string) {
  return value
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\biv\b/g, "4")
    .replace(/\bvi\b/g, "6")
    .replace(/\bv\b/g, "5")
    .replace(/\bi\b/g, "1");
}

function scoreTitleMatch(left: string, right: string) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.8;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}
