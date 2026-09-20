import { it } from "vitest";
import { isUnitMissing, getAiringDisplayDateKey, getAiringDisplayPreferences } from "./metadata";

it("getAiringDisplayPreferences normalizes system timezone", () => {
  const preferences = getAiringDisplayPreferences({
    airing_day_start_hour: 4,
    airing_timezone: "system",
    auto_scan_interval_hours: 12,
    anime_path: "./library/anime",
    import_mode: "copy",
    manga_path: "./library/manga",
    light_novel_path: "./library/light-novels",
    movie_naming_format: "{title}",
    naming_format: "{title}",
    preferred_title: "romaji",
    recycle_cleanup_days: 30,
    recycle_path: "./recycle",
  });

  if (preferences.dayStartHour !== 4 || preferences.timeZone !== undefined) {
    throw new Error(`Expected system timezone preferences, got ${JSON.stringify(preferences)}`);
  }
});

it("getAiringDisplayDateKey respects day start hour", () => {
  const preferences = { dayStartHour: 4, timeZone: "UTC" };

  if (getAiringDisplayDateKey("2024-01-10T02:30:00.000Z", preferences) !== "2024-01-09") {
    throw new Error("Expected early airing to roll back to the previous day");
  }

  if (getAiringDisplayDateKey("2024-01-10T05:30:00.000Z", preferences) !== "2024-01-10") {
    throw new Error("Expected airing after day start to stay on the same day");
  }
});

it("isUnitMissing reads the server-provided missing flag", () => {
  if (!isUnitMissing({ missing: true })) {
    throw new Error("Expected server-flagged missing unit to be missing");
  }

  if (isUnitMissing({ missing: false })) {
    throw new Error("Expected non-missing unit to never be missing");
  }
});
