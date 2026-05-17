import { format, isAfter, isValid, parseISO } from "date-fns";
import type { Media, MediaSearchResult, Config } from "~/api/contracts";

type AnimeDateContext = {
  season?: Media["season"];
  season_year?: number | undefined;
  start_date?: string | undefined;
  start_year?: number | undefined;
};

type AnimeNextAiringContext = Media["next_airing_unit"];

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

export function formatAnimeDate(date?: string, year?: number) {
  if (date) {
    const parsed = parseISO(`${date}T00:00:00Z`);
    return isValid(parsed) ? format(parsed, "MMM d, yyyy") : null;
  }

  return year ? String(year) : null;
}

export function formatAnimeSeason(season?: MediaSearchResult["season"], year?: number) {
  if (!season) {
    return year ? String(year) : null;
  }

  const label = season.charAt(0).toUpperCase() + season.slice(1);
  return year ? `${label} ${year}` : label;
}

export function animeDateSubtitle(media: AnimeDateContext) {
  return (
    formatAnimeSeason(media.season, media.season_year) ??
    formatAnimeDate(media.start_date, media.start_year)
  );
}

export function animeSearchSubtitle(media: MediaSearchResult) {
  return animeDateSubtitle({
    ...(media.season === undefined ? {} : { season: media.season }),
    ...(media.season_year === undefined ? {} : { season_year: media.season_year }),
    ...(media.start_date === undefined ? {} : { start_date: media.start_date }),
    ...(media.start_year === undefined ? {} : { start_year: media.start_year }),
  });
}

export function animeDisplayTitle(media: Pick<Media, "title"> | Pick<MediaSearchResult, "title">) {
  return media.title.english || media.title.romaji || media.title.native || "";
}

export function animeDiscoverySubtitle(input: {
  format?: string | undefined;
  relation_type?: string | undefined;
  season?: MediaSearchResult["season"];
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

export function animeAltTitles(media: Pick<Media | MediaSearchResult, "title">) {
  return [media.title.romaji, media.title.english, media.title.native].filter(
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

  const aired = parseISO(airedDate);
  return isValid(aired) && !isAfter(aired, now);
}

export function formatEpisodeStatusTooltip(input: {
  aired?: string;
  downloaded: boolean;
  unitNumber?: number;
  filePath?: string;
  now?: Date;
  preferences?: AiringDisplayPreferences;
}) {
  const status = input.downloaded
    ? "Downloaded"
    : hasEpisodeAired(input.aired, input.now)
      ? "Missing"
      : "Upcoming";
  const prefix = input.unitNumber ? `MediaUnit ${input.unitNumber}: ` : "";
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

  return format(new Date(parts.year, parts.month - 1, parts.day), "MMM d, yyyy");
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

  return `${format(new Date(parts.year, parts.month - 1, parts.day), "MMM d, yyyy")} ${formatTimeParts(parts)}`;
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

  const formatter = new Intl.DateTimeFormat(undefined, options);
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

  return format(new Date(year, month - 1, day), "MMM d, yyyy");
}

function formatTimeParts(parts: { hour: number; minute: number }) {
  return format(new Date(2000, 0, 1, parts.hour, parts.minute), "h:mm a");
}

function normalizeTimeZone(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.toLowerCase() === "system") {
    return undefined;
  }

  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
