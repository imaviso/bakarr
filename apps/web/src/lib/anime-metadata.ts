import type { Anime, AnimeSearchResult, Config } from "~/lib/api";

type AnimeDateContext = {
  season?: Anime["season"];
  season_year?: number | undefined;
  start_date?: string | undefined;
  start_year?: number | undefined;
};

type AnimeNextAiringContext = Anime["next_airing_episode"];

export interface AiringDisplayPreferences {
  dayStartHour: number;
  timeZone?: string | undefined;
}

export function getAiringDisplayPreferences(library?: Config["library"]): AiringDisplayPreferences {
  const dayStartHour =
    typeof library?.airing_day_start_hour === "number" ? library.airing_day_start_hour : 0;
  const timeZone = normalizeTimeZone(library?.airing_timezone);

  return {
    dayStartHour,
    ...(timeZone === undefined ? {} : { timeZone }),
  };
}

export function formatAiringDateTime(value?: string) {
  return formatAiringDateTimeWithPreferences(value);
}

export function formatAiringTime(value?: string) {
  return formatAiringTimeWithPreferences(value);
}

export function formatAnimeDate(date?: string, year?: number) {
  if (date) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString();
  }

  return year ? String(year) : null;
}

export function formatAnimeSeason(season?: AnimeSearchResult["season"], year?: number) {
  if (!season) {
    return year ? String(year) : null;
  }

  const label = season.charAt(0).toUpperCase() + season.slice(1);
  return year ? `${label} ${year}` : label;
}

export function animeDateSubtitle(anime: AnimeDateContext) {
  return (
    formatAnimeSeason(anime.season, anime.season_year) ??
    formatAnimeDate(anime.start_date, anime.start_year)
  );
}

export function animeSearchSubtitle(anime: AnimeSearchResult) {
  return animeDateSubtitle({
    ...(anime.season === undefined ? {} : { season: anime.season }),
    ...(anime.season_year === undefined ? {} : { season_year: anime.season_year }),
    ...(anime.start_date === undefined ? {} : { start_date: anime.start_date }),
    ...(anime.start_year === undefined ? {} : { start_year: anime.start_year }),
  });
}

export function animeDisplayTitle(anime: Pick<Anime, "title"> | Pick<AnimeSearchResult, "title">) {
  return anime.title.english || anime.title.romaji || anime.title.native || "Unknown title";
}

export function animeDiscoverySubtitle(input: {
  format?: string | undefined;
  relation_type?: string | undefined;
  season?: AnimeSearchResult["season"];
  season_year?: number | undefined;
  start_year?: number | undefined;
  status?: string | undefined;
}) {
  return [
    input.relation_type ? formatRelationType(input.relation_type) : undefined,
    input.format,
    formatAnimeSeason(input.season, input.season_year) ??
      (input.start_year ? String(input.start_year) : undefined),
    input.status ? input.status.replaceAll("_", " ").toLowerCase() : undefined,
  ].filter((value): value is string => Boolean(value));
}

export function animeAltTitles(anime: Pick<Anime | AnimeSearchResult, "title">) {
  return [anime.title.romaji, anime.title.english, anime.title.native].filter(
    (value, index, values): value is string =>
      typeof value === "string" && value.length > 0 && values.indexOf(value) === index,
  );
}

function formatRelationType(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function formatNextAiringEpisode(
  nextAiring?: AnimeNextAiringContext,
  preferences?: AiringDisplayPreferences,
) {
  if (!nextAiring?.airing_at) {
    return null;
  }

  const airingLabel = formatAiringDateTimeWithPreferences(nextAiring.airing_at, preferences);
  if (!airingLabel) {
    return `Ep ${nextAiring.episode}`;
  }

  return `Ep ${nextAiring.episode} airs ${airingLabel}`;
}

export function hasEpisodeAired(airedDate?: string, now = new Date()) {
  if (!airedDate) {
    return false;
  }

  const aired = new Date(airedDate);
  return !Number.isNaN(aired.getTime()) && aired <= now;
}

export function formatEpisodeStatusTooltip(input: {
  aired?: string;
  downloaded: boolean;
  episodeNumber?: number;
  filePath?: string;
  now?: Date;
  preferences?: AiringDisplayPreferences;
}) {
  const status = input.downloaded
    ? "Downloaded"
    : hasEpisodeAired(input.aired, input.now)
      ? "Missing"
      : "Upcoming";
  const prefix = input.episodeNumber ? `Episode ${input.episodeNumber}: ` : "";
  const fileName = input.filePath?.split("/").pop();

  if (input.downloaded && fileName) {
    return `${prefix}${status} - ${fileName}`;
  }

  const airedLabel = formatAiringDateTimeWithPreferences(input.aired, input.preferences);

  return airedLabel ? `${prefix}${status} (Aired: ${airedLabel})` : `${prefix}${status}`;
}

export function formatAiringDateWithPreferences(
  value?: string,
  preferences?: AiringDisplayPreferences,
) {
  if (!value) {
    return null;
  }

  if (!value.includes("T")) {
    return formatDateOnly(value);
  }

  const parts = getAdjustedDateTimeParts(value, preferences);
  if (!parts) {
    return value;
  }

  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString();
}

export function formatAiringDateTimeWithPreferences(
  value?: string,
  preferences?: AiringDisplayPreferences,
) {
  if (!value) {
    return null;
  }

  if (!value.includes("T")) {
    return formatDateOnly(value);
  }

  const parts = getAdjustedDateTimeParts(value, preferences);
  if (!parts) {
    return value;
  }

  return `${new Date(
    parts.year,
    parts.month - 1,
    parts.day,
  ).toLocaleDateString()} ${formatTimeParts(parts)}`;
}

export function formatAiringTimeWithPreferences(
  value?: string,
  preferences?: AiringDisplayPreferences,
) {
  const parts = getAdjustedDateTimeParts(value, preferences);
  return parts ? formatTimeParts(parts) : null;
}

export function getAiringDisplayDateKey(value: string, preferences?: AiringDisplayPreferences) {
  if (!value.includes("T")) {
    return value.slice(0, 10);
  }

  const parts = getAdjustedDateTimeParts(value, preferences);
  if (!parts) {
    return value.slice(0, 10);
  }

  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function getAdjustedDateTimeParts(
  value: string | undefined,
  preferences?: AiringDisplayPreferences,
) {
  if (!value?.includes("T")) {
    return null;
  }

  const airingAt = new Date(value);
  if (Number.isNaN(airingAt.getTime())) {
    return null;
  }

  const parts = getDateTimeParts(airingAt, preferences?.timeZone);
  const dayStartHour = preferences?.dayStartHour ?? 0;

  if (parts.hour >= dayStartHour) {
    return parts;
  }

  const previousDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);

  return {
    ...parts,
    day: previousDay.getUTCDate(),
    month: previousDay.getUTCMonth() + 1,
    year: previousDay.getUTCFullYear(),
  };
}

function getDateTimeParts(date: Date, timeZone?: string) {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  };

  const formatter = createDateTimeFormat(options);
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const day = Number(parts["day"]);
  const hour = Number(parts["hour"]);
  const minute = Number(parts["minute"]);
  const month = Number(parts["month"]);
  const year = Number(parts["year"]);

  return {
    day,
    hour,
    minute,
    month,
    year,
  };
}

function formatDateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return value;
  }

  if (![year, month, day].every(Number.isFinite)) {
    return value;
  }

  return new Date(year, month - 1, day).toLocaleDateString();
}

function formatTimeParts(parts: { hour: number; minute: number }) {
  return new Date(2000, 0, 1, parts.hour, parts.minute).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeTimeZone(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.toLowerCase() === "system") {
    return undefined;
  }

  try {
    return createDateTimeFormat({ timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function createDateTimeFormat(options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(undefined, options);
  } catch {
    const { timeZone: _ignored, ...fallback } = options;
    return new Intl.DateTimeFormat(undefined, fallback);
  }
}
