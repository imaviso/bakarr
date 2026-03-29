import { DailyEpisodeIdentity } from "@/lib/media-identity-model.ts";
import { isValidDate } from "@/lib/media-identity-parser-shared.ts";

export function parseDailyIdentity(value: string): DailyEpisodeIdentity | undefined {
  const ymdMatch = value.match(
    /(?:^|[\s._\-[(])(\d{4})[\s._-](\d{2})[\s._-](\d{2})(?:[\s._\-\])]|$)/,
  );
  if (ymdMatch) {
    const [year, month, day] = [Number(ymdMatch[1]), Number(ymdMatch[2]), Number(ymdMatch[3])];
    if (isValidDate(year, month, day)) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return new DailyEpisodeIdentity({
        scheme: "daily",
        air_dates: [dateStr],
        label: dateStr,
      });
    }
  }

  const dmyMatch = value.match(
    /(?:^|[\s._\-[(])(\d{2})[\s._-](\d{2})[\s._-](\d{4})(?:[\s._\-\])]|$)/,
  );
  if (dmyMatch) {
    const [day, month, year] = [Number(dmyMatch[1]), Number(dmyMatch[2]), Number(dmyMatch[3])];
    if (isValidDate(year, month, day) && year >= 1900 && year <= 2100) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return new DailyEpisodeIdentity({
        scheme: "daily",
        air_dates: [dateStr],
        label: dateStr,
      });
    }
  }

  return undefined;
}
