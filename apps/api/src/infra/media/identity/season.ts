import { SeasonEpisodeIdentity } from "@/infra/media/identity/model.ts";
import { formatSeasonLabel, rangeArray } from "@/infra/media/identity/parser-shared.ts";

export function parseSeasonEpisodeIdentity(value: string): SeasonEpisodeIdentity | undefined {
  if (hasMalformedSeasonEpisodeRange(value)) {
    return undefined;
  }

  const rangeMatch = value.match(
    /(?:^|[\s._\-[(])s(\d{1,2})[\s._-]*e(\d{1,4})\s*[-~]\s*(?:s\d{1,2}[\s._-]*)?e?(\d{1,4})(?:[\s._\-\])]|$)/i,
  );
  if (rangeMatch) {
    const season = Number(rangeMatch[1]);
    const start = Number(rangeMatch[2]);
    const end = Number(rangeMatch[3]);
    if (start > 0 && end >= start && end - start <= 500 && end < 2000) {
      const eps = rangeArray(start, end);
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: eps,
        label: formatSeasonLabel(season, eps),
      });
    }
  }

  const multiMatch = value.match(
    /(?:^|[\s._\-[(])s(\d{1,2})[\s._-]*e(\d{1,4})(?:[\s._-]*e(\d{1,4}))+(?:[\s._\-\])]|$)/i,
  );
  if (multiMatch) {
    const season = Number(multiMatch[1]);
    const eps = collectSeasonEpisodes(value);
    if (eps.length > 0) {
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: eps,
        label: formatSeasonLabel(season, eps),
      });
    }
  }

  const singleMatch = value.match(
    /(?:^|[\s._\-[(])s(\d{1,2})[\s._-]*e(\d{1,4})(?:v\d+)?(?:[\s._\-\])]|$)/i,
  );
  if (singleMatch) {
    const season = Number(singleMatch[1]);
    const ep = Number(singleMatch[2]);
    if (ep > 0 && ep < 2000) {
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${String(ep).padStart(2, "0")}`,
      });
    }
  }

  const crossRangeMatch = value.match(
    /(?:^|[\s._\-[(])(\d{1,2})x(\d{1,3})\s*[-~]\s*(?:\d{1,2}x)?(\d{1,3})(?:[\s._\-\])]|$)/i,
  );
  if (crossRangeMatch) {
    const season = Number(crossRangeMatch[1]);
    const start = Number(crossRangeMatch[2]);
    const end = Number(crossRangeMatch[3]);
    if (start > 0 && end >= start && end - start <= 500 && end < 2000) {
      const eps = rangeArray(start, end);
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: eps,
        label: formatSeasonLabel(season, eps),
      });
    }
  }

  const crossMatch = value.match(/(?:^|[\s._\-[(])(\d{1,2})x(\d{1,3})(?:[\s._\-\])]|$)/i);
  if (crossMatch) {
    const season = Number(crossMatch[1]);
    const ep = Number(crossMatch[2]);
    if (ep > 0 && ep < 2000) {
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${String(ep).padStart(2, "0")}`,
      });
    }
  }

  const longMatch = value.match(
    /(?:^|[\s._\-[(])season[\s._-]*(\d{1,2})[\s._-]*(?:ep|e|episode)[\s._-]*(\d{1,3})(?:[\s._\-\])]|$)/i,
  );
  if (longMatch) {
    const season = Number(longMatch[1]);
    const ep = Number(longMatch[2]);
    if (ep > 0 && ep < 2000) {
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${String(ep).padStart(2, "0")}`,
      });
    }
  }

  const seasonDashMatch = value.match(
    /(?:^|[\s._-])season[\s._-]*(\d{1,2})[\s._-]+(?:-[\s._-]*)?(\d{1,3})(?:[\s._\-[(]|$)/i,
  );
  if (seasonDashMatch) {
    const season = Number(seasonDashMatch[1]);
    const ep = Number(seasonDashMatch[2]);
    if (ep > 0 && ep < 2000) {
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${String(ep).padStart(2, "0")}`,
      });
    }
  }

  const ordinalSeasonDashMatch = value.match(
    /(?:^|[\s._-])(\d{1,2})(?:st|nd|rd|th)[\s._-]+season[\s._-]+(?:-[\s._-]*)?(\d{1,3})(?:[\s._\-[(]|$)/i,
  );
  if (ordinalSeasonDashMatch) {
    const season = Number(ordinalSeasonDashMatch[1]);
    const ep = Number(ordinalSeasonDashMatch[2]);
    if (ep > 0 && ep < 2000) {
      return new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${String(ep).padStart(2, "0")}`,
      });
    }
  }

  return undefined;
}

function hasMalformedSeasonEpisodeRange(value: string) {
  const match = value.match(
    /(?:^|[\s._\-[(])s\d{1,2}[\s._-]*e(\d{1,4})\s*[-~]\s*(?:s\d{1,2}[\s._-]*)?e?(\d{1,4})(?:[\s._\-\])]|$)/i,
  );

  if (!match) {
    return false;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  return !(start > 0 && end >= start && end - start <= 500 && end < 2000);
}

function collectSeasonEpisodes(value: string): number[] {
  const fullMatch = value.match(/s(\d{1,2})([\s._-]*e\d{1,4}(?:[\s._-]*e\d{1,4})*)/i);
  if (!fullMatch) return [];

  const [, , episodePart] = fullMatch;
  if (!episodePart) {
    return [];
  }
  const epMatches = episodePart.matchAll(/e(\d{1,4})/gi);
  const episodes: number[] = [];
  for (const m of epMatches) {
    const num = Number(m[1]);
    if (num > 0 && num < 2000) {
      episodes.push(num);
    }
  }
  return episodes;
}
