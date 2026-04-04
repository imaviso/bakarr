/**
 * Normalize release/file strings before identity parsing.
 *
 * We keep this intentionally small and focused on high-signal anime patterns.
 */
export function normalizeSourceText(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/\u3010/g, "[")
    .replace(/\u3011/g, "]")
    .replace(/\uFF08/g, "(")
    .replace(/\uFF09/g, ")")
    .replace(
      /\u7B2C\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(?:\u8A71|\u8BDD|\u96C6)(?:\s*(?:END|\u5B8C|Fin))?/giu,
      "$1",
    )
    .replace(/\u7B2C\s*([0-9]{1,2})\s*\u5B63/giu, "Season $1")
    .replace(/\bS0*([2-9]|[1-9][0-9])\b/gi, "Season $1")
    .replace(/([0-9]{1,4}(?:-[0-9]{1,4})?)\s*(?:END|\u5B8C|Fin)/giu, "$1");

  return applyChineseAnimePreSubstitutions(normalized).replace(/\s+/g, " ").trim();
}

function applyChineseAnimePreSubstitutions(value: string): string {
  const withSeasonMarker = value.match(
    /^\[(?<group>[^\]]+)\]\s*★[^\[]+★\s*\[(?<title>[^\]]+)\]\[(?<episode>\d{1,4}(?:-\d{1,4})?)\](?<rest>.*)$/u,
  );

  if (withSeasonMarker?.groups) {
    const preferredTitle = preferredTitleAlias(withSeasonMarker.groups.title);
    return `[${withSeasonMarker.groups.group}] ${preferredTitle} - ${withSeasonMarker.groups.episode}${withSeasonMarker.groups.rest}`;
  }

  const withTwoTitlesAndYear = value.match(
    /^\[(?<group>[^\]]+)\]\[(?<titleA>[^\]]+)\]\[(?<titleB>[^\]]+)\]\[(?<year>(?:19|20)\d{2})\]\[(?<episode>\d{1,4}(?:-\d{1,4})?)\](?<rest>.*)$/u,
  );

  if (withTwoTitlesAndYear?.groups) {
    const preferredTitle = preferredTitleAlias(withTwoTitlesAndYear.groups.titleB);
    return `[${withTwoTitlesAndYear.groups.group}] ${preferredTitle} - ${withTwoTitlesAndYear.groups.episode}${withTwoTitlesAndYear.groups.rest}`;
  }

  const withOneTitleAndYear = value.match(
    /^\[(?<group>[^\]]+)\]\[(?<title>[^\]]+)\]\[(?<year>(?:19|20)\d{2})\]\[(?<episode>\d{1,4}(?:-\d{1,4})?)\](?<rest>.*)$/u,
  );

  if (withOneTitleAndYear?.groups) {
    const preferredTitle = preferredTitleAlias(withOneTitleAndYear.groups.title);
    return `[${withOneTitleAndYear.groups.group}] ${preferredTitle} - ${withOneTitleAndYear.groups.episode}${withOneTitleAndYear.groups.rest}`;
  }

  const withBracketedTitleAndEpisode = value.match(
    /^\[(?<group>[^\]]+)\]\[(?<title>[^\]]+)\]\[(?<episode>\d{1,4}(?:-\d{1,4})?)\](?<rest>.*)$/u,
  );

  if (withBracketedTitleAndEpisode?.groups) {
    const preferredTitle = preferredTitleAlias(withBracketedTitleAndEpisode.groups.title);
    return `[${withBracketedTitleAndEpisode.groups.group}] ${preferredTitle} - ${withBracketedTitleAndEpisode.groups.episode}${withBracketedTitleAndEpisode.groups.rest}`;
  }

  return value;
}

function preferredTitleAlias(value: string): string {
  const aliases = value
    .split(/[\/|]/)
    .map((part) => part.replace(/[._]+/g, " ").trim())
    .filter((part) => part.length > 0);

  if (aliases.length === 0) {
    return value.replace(/[._]+/g, " ").trim();
  }

  const latinAlias = aliases.find((alias) => /[a-z]/i.test(alias));
  const base = latinAlias ?? aliases[0];

  const mixedAlias = extractLatinAliasFromMixedTitle(base);
  return mixedAlias ?? base;
}

function extractLatinAliasFromMixedTitle(value: string): string | undefined {
  if (!/[a-z]/i.test(value) || !/\p{Script=Han}/u.test(value)) {
    return undefined;
  }

  const headLatin = value.match(/^([A-Za-z][A-Za-z0-9 '&:;,.!?-]{2,})\s+\p{Script=Han}/u);
  if (headLatin?.[1]) {
    return headLatin[1].trim();
  }

  const chunks = value
    .split(/[_|\/\u00B7\-]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const latinChunk = chunks.find((part) => /[a-z]/i.test(part) && !/\p{Script=Han}/u.test(part));
  if (latinChunk) {
    return latinChunk;
  }

  const tailLatin = value.match(/([A-Za-z][A-Za-z0-9 '&:;,.!?-]{2,})$/);
  return tailLatin?.[1]?.trim();
}
