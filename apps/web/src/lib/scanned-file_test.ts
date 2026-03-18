/// <reference lib="deno.ns" />

import {
  formatDurationSeconds,
  formatNamingTitleSource,
  namingMetadataBadges,
  summarizeImportNamingOutcome,
} from "./scanned-file.ts";

Deno.test("scanned file naming helpers format title source and badges", () => {
  if (formatNamingTitleSource("fallback_native") !== "Fallback Native") {
    throw new Error("Expected fallback native label");
  }

  const badges = namingMetadataBadges({
    audio_channels: "2.0",
    audio_codec: "AAC",
    duration_seconds: 1440,
    group: "SubsPlease",
    quality: "WEB-DL",
    resolution: "1080p",
    season: 1,
    source_identity: { label: "S01E01" },
    video_codec: "HEVC",
    year: 2025,
  });

  const expected = [
    "S01E01",
    "Season 1",
    "2025",
    "24m",
    "SubsPlease",
    "WEB-DL 1080p",
    "HEVC",
    "AAC 2.0",
  ];

  if (JSON.stringify(badges) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected naming badges: ${JSON.stringify(badges)}`);
  }
});

Deno.test("scanned file naming helpers summarize fallback and warning counts", () => {
  const summary = summarizeImportNamingOutcome([
    { naming_fallback_used: true, naming_warnings: ["missing season"] },
    { naming_warnings: ["ambiguous episode title"] },
    {},
  ]);

  if (summary !== "1 used fallback naming; 2 had naming warnings") {
    throw new Error(`Unexpected import naming summary: ${summary}`);
  }

  if (formatDurationSeconds(65) !== "1m 5s") {
    throw new Error(
      "Expected duration formatter to render minute/second output",
    );
  }
});
