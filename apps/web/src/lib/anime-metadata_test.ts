/// <reference lib="deno.ns" />

import {
  formatEpisodeStatusTooltip,
  getAiringDisplayDateKey,
  getAiringDisplayPreferences,
} from "./anime-metadata.ts";

Deno.test("getAiringDisplayPreferences normalizes system timezone", () => {
  const preferences = getAiringDisplayPreferences({
    airing_day_start_hour: 4,
    airing_timezone: "system",
    auto_scan_interval_hours: 12,
    import_mode: "copy",
    library_path: "./library",
    movie_naming_format: "{title}",
    naming_format: "{title}",
    preferred_title: "romaji",
    recycle_cleanup_days: 30,
    recycle_path: "./recycle",
  });

  if (preferences.dayStartHour !== 4 || preferences.timeZone !== undefined) {
    throw new Error(
      `Expected system timezone preferences, got ${
        JSON.stringify(preferences)
      }`,
    );
  }
});

Deno.test("getAiringDisplayDateKey respects day start hour", () => {
  const preferences = { dayStartHour: 4, timeZone: "UTC" };

  if (
    getAiringDisplayDateKey("2024-01-10T02:30:00.000Z", preferences) !==
      "2024-01-09"
  ) {
    throw new Error("Expected early airing to roll back to the previous day");
  }

  if (
    getAiringDisplayDateKey("2024-01-10T05:30:00.000Z", preferences) !==
      "2024-01-10"
  ) {
    throw new Error("Expected airing after day start to stay on the same day");
  }
});

Deno.test("formatEpisodeStatusTooltip includes downloaded filename", () => {
  const tooltip = formatEpisodeStatusTooltip({
    downloaded: true,
    episodeNumber: 7,
    filePath: "/library/Show/Show - 07.mkv",
  });

  if (tooltip !== "Episode 7: Downloaded - Show - 07.mkv") {
    throw new Error(`Unexpected downloaded tooltip: ${tooltip}`);
  }
});

Deno.test("formatEpisodeStatusTooltip uses airing preferences for missing episodes", () => {
  const tooltip = formatEpisodeStatusTooltip({
    aired: "2024-01-10T02:30:00.000Z",
    downloaded: false,
    episodeNumber: 3,
    now: new Date("2024-01-10T03:00:00.000Z"),
    preferences: { dayStartHour: 4, timeZone: "UTC" },
  });

  if (!tooltip.startsWith("Episode 3: Missing (Aired:")) {
    throw new Error(`Expected missing tooltip, got ${tooltip}`);
  }

  if (!tooltip.includes("1/9/2024") || !tooltip.includes("2:30")) {
    throw new Error(`Expected day-start adjusted airing label, got ${tooltip}`);
  }
});
