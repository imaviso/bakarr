import type { ParsedRelease } from "./rss-client.ts";
import { parseReleaseName } from "./release-ranking.ts";
import type { SeaDexEntry, SeaDexRelease } from "./seadex-client.ts";

export function applySeaDexMatch(release: ParsedRelease, entry: SeaDexEntry): ParsedRelease {
  const match = findSeaDexReleaseMatch(release, entry.releases);

  if (!match) {
    return release;
  }

  return {
    ...release,
    group: release.group ?? match.releaseGroup,
    isSeaDex: true,
    isSeaDexBest: match.isBest,
    seaDexComparison: entry.comparison,
    seaDexDualAudio: match.dualAudio,
    seaDexNotes: entry.notes,
    seaDexReleaseGroup: match.releaseGroup,
    seaDexTags: match.tags,
  };
}

export function findSeaDexReleaseMatch(
  release: ParsedRelease,
  candidates: readonly SeaDexRelease[],
): SeaDexRelease | undefined {
  const normalizedInfoHash = normalizeInfoHash(release.infoHash);

  if (normalizedInfoHash) {
    const infoHashMatch = candidates.find(
      (candidate) => normalizeInfoHash(candidate.infoHash) === normalizedInfoHash,
    );

    if (infoHashMatch) {
      return infoHashMatch;
    }
  }

  const releaseUrlKey = canonicalTrackerUrl(release.viewUrl);
  if (releaseUrlKey) {
    const urlMatch = candidates.find((candidate) =>
      toCandidateUrlKeys(candidate).includes(releaseUrlKey),
    );

    if (urlMatch) {
      return urlMatch;
    }
  }

  const parsed = parseReleaseName(release.title);
  const normalizedGroup = normalizeGroup(parsed.group ?? release.group);
  const releaseTracker = inferTrackerName(release.viewUrl);
  const dualAudioHint = inferDualAudioHint(release.title);

  if (!normalizedGroup) {
    return undefined;
  }

  const [bestCandidate] = candidates
    .filter((candidate) => normalizeGroup(candidate.releaseGroup) === normalizedGroup)
    .map((candidate) => ({
      candidate,
      score: scoreSeaDexCandidate({
        candidate,
        dualAudioHint,
        normalizedGroup,
        releaseTracker,
        releaseUrlKey,
      }),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || Number(right.candidate.isBest) - Number(left.candidate.isBest),
    );

  return bestCandidate?.candidate;
}

function scoreSeaDexCandidate(input: {
  candidate: SeaDexRelease;
  dualAudioHint?: boolean;
  normalizedGroup?: string;
  releaseTracker?: string;
  releaseUrlKey?: string;
}) {
  let score = 0;

  const candidateGroup = normalizeGroup(input.candidate.releaseGroup);
  if (input.normalizedGroup && candidateGroup === input.normalizedGroup) {
    score += 50;
  }

  if (input.releaseTracker && toCandidateTrackers(input.candidate).includes(input.releaseTracker)) {
    score += 15;
  }

  if (input.releaseUrlKey && toCandidateUrlKeys(input.candidate).includes(input.releaseUrlKey)) {
    score += 80;
  }

  if (input.dualAudioHint === true) {
    score += input.candidate.dualAudio ? 10 : -5;
  }

  return score;
}

function toCandidateTrackers(candidate: SeaDexRelease) {
  return [
    normalizeTrackerName(candidate.tracker),
    inferTrackerName(candidate.url),
    inferTrackerName(candidate.groupedUrl),
  ].filter((value): value is string => Boolean(value));
}

function toCandidateUrlKeys(candidate: SeaDexRelease) {
  return [canonicalTrackerUrl(candidate.url), canonicalTrackerUrl(candidate.groupedUrl)].filter(
    (value): value is string => Boolean(value),
  );
}

function inferDualAudioHint(title: string): boolean | undefined {
  return /dual[\s._-]*audio|multi[\s._-]*audio/i.test(title) ? true : undefined;
}

function normalizeInfoHash(value?: string) {
  return value?.trim().toLowerCase();
}

function normalizeGroup(value?: string) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function inferTrackerName(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeTrackerName(new URL(value).hostname);
  } catch {
    return normalizeTrackerName(value);
  }
}

function normalizeTrackerName(value?: string) {
  if (!value) {
    return undefined;
  }

  const lower = value.toLowerCase();

  if (lower.includes("nyaa")) {
    return "nyaa";
  }

  if (lower.includes("animetosho")) {
    return "animetosho";
  }

  if (lower.includes("tokyotosho")) {
    return "tokyotosho";
  }

  return lower.replace(/[^a-z0-9]+/g, "") || undefined;
}

function canonicalTrackerUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const tracker = normalizeTrackerName(url.hostname);

    if (!tracker) {
      return undefined;
    }

    const nyaaMatch = url.pathname.match(/^\/(?:view|download)\/(\d+)/i);
    if (tracker === "nyaa" && nyaaMatch) {
      return `${tracker}:${nyaaMatch[1]}`;
    }

    const pathname = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    return `${tracker}:${pathname}`;
  } catch {
    return undefined;
  }
}
