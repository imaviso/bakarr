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

it("isUnitMissing reads server airing status instead of recomputing dates", () => {
  if (!isUnitMissing({ downloaded: false, airing_status: "aired" })) {
    throw new Error("Expected aired undownloaded unit to be missing");
  }

  if (isUnitMissing({ downloaded: false, airing_status: "future" })) {
    throw new Error("Expected future unit to be upcoming, not missing");
  }

  if (isUnitMissing({ downloaded: true, airing_status: "aired" })) {
    throw new Error("Expected downloaded unit to never be missing");
  }
});
