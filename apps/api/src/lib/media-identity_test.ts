import { assertEquals, it } from "../test/vitest.ts";

import {
  buildPathParseContext,
  classifyMediaArtifact,
  formatEpisodeSegment,
  parseFileSourceIdentity,
  parseReleaseSourceIdentity,
  rankAnimeCandidates,
  resolveSourceIdentityToEpisodeNumbers,
} from "./media-identity.ts";

// ---------------------------------------------------------------------------
// Daily / airdate parsing
// ---------------------------------------------------------------------------

it("parseFileSourceIdentity: YYYY-MM-DD is a daily identity, not a range", () => {
  const result = parseFileSourceIdentity("Show.2025-03-14.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "daily");
  if (result.source_identity?.scheme === "daily") {
    assertEquals(result.source_identity.air_dates, ["2025-03-14"]);
    assertEquals(result.source_identity.label, "2025-03-14");
  }
});

it("parseFileSourceIdentity: YYYY.MM.DD is a daily identity", () => {
  const result = parseFileSourceIdentity("Show.2025.03.14.1080p.WEB.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "daily");
  if (result.source_identity?.scheme === "daily") {
    assertEquals(result.source_identity.air_dates, ["2025-03-14"]);
  }
});

it("parseReleaseSourceIdentity: daily release title", () => {
  const result = parseReleaseSourceIdentity("[Group] Show Name - 2025.03.14 (1080p)");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "daily");
  if (result.source_identity?.scheme === "daily") {
    assertEquals(result.source_identity.air_dates, ["2025-03-14"]);
  }
});

it("parseFileSourceIdentity: DD.MM.YYYY daily format", () => {
  const result = parseFileSourceIdentity("Show.14.03.2025.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "daily");
  if (result.source_identity?.scheme === "daily") {
    assertEquals(result.source_identity.air_dates, ["2025-03-14"]);
  }
});

// ---------------------------------------------------------------------------
// Season/episode parsing
// ---------------------------------------------------------------------------

it("parseFileSourceIdentity: S02E03 produces season hint 2", () => {
  const result = parseFileSourceIdentity("Overlord.S02E03.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 2);
    assertEquals(result.source_identity.episode_numbers, [3]);
    assertEquals(result.source_identity.label, "S02E03");
  }
});

it("parseFileSourceIdentity: S00E03 produces season hint 0 (specials)", () => {
  const result = parseFileSourceIdentity("Show.S00E03.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 0);
    assertEquals(result.source_identity.episode_numbers, [3]);
    assertEquals(result.source_identity.label, "S00E03");
  }
});

it("parseFileSourceIdentity: S01E01-E02 multi-episode", () => {
  const result = parseFileSourceIdentity("Show - S01E01-E02.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [1, 2]);
    assertEquals(result.source_identity.label, "S01E01-E02");
  }
});

it("parseFileSourceIdentity: S01E01E02 multi-episode without hyphen", () => {
  const result = parseFileSourceIdentity("Show.S01E01E02.1080p.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [1, 2]);
  }
});

it("parseFileSourceIdentity: 1x02 format", () => {
  const result = parseFileSourceIdentity("Show Name - 1x02 - Title.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [2]);
  }
});

it("parseFileSourceIdentity: 1x01-1x02 multi-episode", () => {
  const result = parseFileSourceIdentity("Show Name - 1x01-1x02 - Title.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [1, 2]);
  }
});

it("parseFileSourceIdentity: Season 1 Episode 3 format", () => {
  const result = parseFileSourceIdentity("Show Name - Season 1 Episode 3 - Episode Title.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [3]);
  }
});

it("parseFileSourceIdentity: complex Sonarr filename", () => {
  const result = parseFileSourceIdentity(
    "Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You WEBDL-1080p.mkv",
  );
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [1]);
  }
});

// ---------------------------------------------------------------------------
// Absolute number parsing
// ---------------------------------------------------------------------------

it("parseFileSourceIdentity: fansub style [Group] Show - 12 [1080p].mkv", () => {
  const result = parseFileSourceIdentity("[Group] Show - 12 [1080p].mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "absolute");
  if (result.source_identity?.scheme === "absolute") {
    assertEquals(result.source_identity.episode_numbers, [12]);
  }
});

it("parseFileSourceIdentity: standalone number Title - 01.mkv", () => {
  const result = parseFileSourceIdentity("Title - 01.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "absolute");
  if (result.source_identity?.scheme === "absolute") {
    assertEquals(result.source_identity.episode_numbers, [1]);
  }
});

it("parseFileSourceIdentity: absolute range 03-04", () => {
  const result = parseFileSourceIdentity("[Group] Show - 03-04 [1080p].mkv");
  assertEquals(result.kind, "episode");
  if (result.source_identity?.scheme === "absolute") {
    assertEquals(result.source_identity.episode_numbers, [3, 4]);
  }
});

// ---------------------------------------------------------------------------
// Folder context
// ---------------------------------------------------------------------------

it("parseFileSourceIdentity: folder-only 03.mkv with Specials context", () => {
  const context = buildPathParseContext("/library/Show", "/library/Show/Specials/03.mkv");
  assertEquals(context.is_specials_folder, true);
  assertEquals(context.season_hint, 0);
  assertEquals(context.entry_folder_title, "Show");

  const result = parseFileSourceIdentity("/library/Show/Specials/03.mkv", context);
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 0);
    assertEquals(result.source_identity.episode_numbers, [3]);
  }
});

it("parseFileSourceIdentity: folder-only 01.mkv with Season 1 context", () => {
  const context = buildPathParseContext("/library", "/library/Naruto/Season 1/01.mkv");
  assertEquals(context.season_hint, 1);
  assertEquals(context.entry_folder_title, "Naruto");

  const result = parseFileSourceIdentity("/library/Naruto/Season 1/01.mkv", context);
  assertEquals(result.kind, "episode");
  assertEquals(result.parsed_title, "Naruto");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [1]);
  }
});

it("buildPathParseContext: detects sequel hint from folder name", () => {
  const context = buildPathParseContext("/library", "/library/Overlord II/03.mkv");
  assertEquals(context.entry_folder_title, "Overlord II");
  assertEquals(context.sequel_hint, "II");
});

it("buildPathParseContext: detects Season 0 as specials", () => {
  const context = buildPathParseContext("/library/Show", "/library/Show/Season 0/03.mkv");
  assertEquals(context.is_specials_folder, true);
  assertEquals(context.season_hint, 0);
});

it("buildPathParseContext: S01 folder notation", () => {
  const context = buildPathParseContext("/library/Show", "/library/Show/S01/01.mkv");
  assertEquals(context.season_hint, 1);
});

// ---------------------------------------------------------------------------
// Extras and samples
// ---------------------------------------------------------------------------

it("classifyMediaArtifact: Featurette.mkv is extra", () => {
  const result = classifyMediaArtifact("/library/Show/Featurette.mkv", "Featurette.mkv");
  assertEquals(result.kind, "extra");
  assertEquals(typeof result.skip_reason, "string");
});

it("classifyMediaArtifact: sample-Show.S01E01.mkv is sample", () => {
  const result = classifyMediaArtifact(
    "/library/Show/sample-Show.S01E01.mkv",
    "sample-Show.S01E01.mkv",
  );
  assertEquals(result.kind, "sample");
  assertEquals(typeof result.skip_reason, "string");
});

it("classifyMediaArtifact: file inside Extras folder", () => {
  const result = classifyMediaArtifact(
    "/library/Show/Extras/behind-the-scenes.mkv",
    "behind-the-scenes.mkv",
  );
  assertEquals(result.kind, "extra");
});

it("classifyMediaArtifact: file inside sample folder", () => {
  const result = classifyMediaArtifact("/downloads/Show/sample/clip.mkv", "clip.mkv");
  assertEquals(result.kind, "sample");
});

it("parseFileSourceIdentity: Featurette.mkv is skipped as extra", () => {
  const result = parseFileSourceIdentity("/library/Show/Featurette.mkv");
  assertEquals(result.kind, "extra");
  assertEquals(typeof result.skip_reason, "string");
});

it("parseFileSourceIdentity: sample-Show.S01E01.mkv is skipped as sample", () => {
  const result = parseFileSourceIdentity("/library/Show/sample-Show.S01E01.mkv");
  assertEquals(result.kind, "sample");
  assertEquals(typeof result.skip_reason, "string");
});

it("classifyMediaArtifact: Trailer.mkv is extra", () => {
  const result = classifyMediaArtifact("/library/Show/Trailer.mkv", "Trailer.mkv");
  assertEquals(result.kind, "extra");
});

it("classifyMediaArtifact: file in Deleted Scenes folder", () => {
  const result = classifyMediaArtifact("/library/Show/Deleted Scenes/scene1.mkv", "scene1.mkv");
  assertEquals(result.kind, "extra");
});

// ---------------------------------------------------------------------------
// Release title parsing (parseReleaseSourceIdentity)
// ---------------------------------------------------------------------------

it("parseReleaseSourceIdentity: standard release with S01E07", () => {
  const result = parseReleaseSourceIdentity("Show.Name.S01E07.1080p.WEB-DL.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.season, 1);
    assertEquals(result.source_identity.episode_numbers, [7]);
  }
  assertEquals(result.resolution, "1080p");
});

it("parseReleaseSourceIdentity: 1x02 format", () => {
  const result = parseReleaseSourceIdentity("Show Name - 1x02 - Title");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.episode_numbers, [2]);
  }
});

it("parseReleaseSourceIdentity: Season 1 Episode 3 format", () => {
  const result = parseReleaseSourceIdentity("Show Name - Season 1 Episode 3 - Title");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.episode_numbers, [3]);
  }
});

it("parseReleaseSourceIdentity: fansub absolute number", () => {
  const result = parseReleaseSourceIdentity("[SubsPlease] Show Name - 14 (1080p)");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "absolute");
  if (result.source_identity?.scheme === "absolute") {
    assertEquals(result.source_identity.episode_numbers, [14]);
  }
  assertEquals(result.group, "SubsPlease");
});

it("parseFileSourceIdentity: trailing bracket group is detected", () => {
  const result = parseFileSourceIdentity(
    "Nisemonogatari - S01E01 - Karen Bee, Part 1 -[1920x1080]-[hevc]-[aac][MTBB].mkv",
  );

  assertEquals(result.group, "MTBB");
});

it("parseReleaseSourceIdentity: release and file parser agree on 1x02", () => {
  const releaseResult = parseReleaseSourceIdentity("Show Name - 1x02 - Title");
  const fileResult = parseFileSourceIdentity("Show Name - 1x02 - Title.mkv");
  assertEquals(releaseResult.source_identity?.scheme, fileResult.source_identity?.scheme);
  if (
    releaseResult.source_identity?.scheme === "season" &&
    fileResult.source_identity?.scheme === "season"
  ) {
    assertEquals(
      releaseResult.source_identity.episode_numbers,
      fileResult.source_identity.episode_numbers,
    );
  }
});

it("parseReleaseSourceIdentity: release and file parser agree on Season 1 Episode 3", () => {
  const releaseResult = parseReleaseSourceIdentity("Show Name - Season 1 Episode 3 - Title");
  const fileResult = parseFileSourceIdentity("Show Name - Season 1 Episode 3 - Title.mkv");
  assertEquals(releaseResult.source_identity?.scheme, fileResult.source_identity?.scheme);
  if (
    releaseResult.source_identity?.scheme === "season" &&
    fileResult.source_identity?.scheme === "season"
  ) {
    assertEquals(
      releaseResult.source_identity.episode_numbers,
      fileResult.source_identity.episode_numbers,
    );
  }
});

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

it("parseFileSourceIdentity: extracts title before S01E07", () => {
  const result = parseFileSourceIdentity("Show.Name.S01E07.1080p.WEB-DL.mkv");
  assertEquals(result.parsed_title, "Show Name");
});

it("parseFileSourceIdentity: extracts title from folder context for bare number", () => {
  const context = buildPathParseContext("/library", "/library/Overlord II/03.mkv");
  const result = parseFileSourceIdentity("/library/Overlord II/03.mkv", context);
  assertEquals(result.parsed_title, "Overlord II");
});

// ---------------------------------------------------------------------------
// formatEpisodeSegment
// ---------------------------------------------------------------------------

it("formatEpisodeSegment: single episode", () => {
  assertEquals(formatEpisodeSegment({ episode_numbers: [3] }), "03");
});

it("formatEpisodeSegment: multi-episode contiguous", () => {
  assertEquals(formatEpisodeSegment({ episode_numbers: [3, 4] }), "03-04");
});

it("formatEpisodeSegment: three-digit episode", () => {
  assertEquals(formatEpisodeSegment({ episode_numbers: [178] }), "178");
});

it("formatEpisodeSegment: use source label", () => {
  assertEquals(
    formatEpisodeSegment({
      episode_numbers: [3],
      source_identity: {
        scheme: "season",
        season: 2,
        episode_numbers: [3],
        label: "S02E03",
      },
      use_source_label: true,
    }),
    "S02E03",
  );
});

it("formatEpisodeSegment: daily source label", () => {
  assertEquals(
    formatEpisodeSegment({
      episode_numbers: [178],
      source_identity: {
        scheme: "daily",
        air_dates: ["2025-03-14"],
        label: "2025-03-14",
      },
      use_source_label: true,
    }),
    "2025-03-14",
  );
});

// ---------------------------------------------------------------------------
// Edge cases and regressions
// ---------------------------------------------------------------------------

it("parseFileSourceIdentity: does not interpret 2025-03-14 as episode range 3..14", () => {
  const result = parseFileSourceIdentity("Show.2025-03-14.mkv");
  assertEquals(result.source_identity?.scheme, "daily");
  // Must NOT produce absolute or season episodes [3..14]
  if (result.source_identity?.scheme === "daily") {
    assertEquals(result.source_identity.air_dates, ["2025-03-14"]);
  }
});

it("parseFileSourceIdentity: unknown file gets skip_reason", () => {
  const result = parseFileSourceIdentity("randomfile.mkv");
  // This might parse a number or not — but if it truly can't, it should be unknown
  // "randomfile" has no numbers so it should be unknown
  assertEquals(result.kind, "unknown");
  assertEquals(typeof result.skip_reason, "string");
});

it("parseFileSourceIdentity: non-video file classified correctly", () => {
  const result = classifyMediaArtifact("/library/Show/info.nfo", "info.nfo");
  assertEquals(result.kind, "unknown");
});

it("parseFileSourceIdentity: v2 version suffix handled", () => {
  const result = parseFileSourceIdentity("Show.S01E01v2.1080p.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.episode_numbers, [1]);
  }
});

it("parseFileSourceIdentity: S01E01-E02 range via hyphen", () => {
  const result = parseFileSourceIdentity("Show.Name.S01E01-E02.1080p.WEB-DL.mkv");
  assertEquals(result.kind, "episode");
  assertEquals(result.source_identity?.scheme, "season");
  if (result.source_identity?.scheme === "season") {
    assertEquals(result.source_identity.episode_numbers, [1, 2]);
  }
});

it("parseFileSourceIdentity: 01-02.mkv inside Season 1 folder", () => {
  const context = buildPathParseContext("/library/Show", "/library/Show/Season 1/01-02.mkv");
  const result = parseFileSourceIdentity("/library/Show/Season 1/01-02.mkv", context);
  assertEquals(result.kind, "episode");
  // Should have two episodes
  if (
    result.source_identity?.scheme === "season" ||
    result.source_identity?.scheme === "absolute"
  ) {
    assertEquals(result.source_identity.episode_numbers.length, 2);
    assertEquals(result.source_identity.episode_numbers[0], 1);
    assertEquals(result.source_identity.episode_numbers[1], 2);
  }
});

// ---------------------------------------------------------------------------
// Resolver tests (Issue 2)
// ---------------------------------------------------------------------------

it("resolveSourceIdentityToEpisodeNumbers: season identity resolves to episode component", () => {
  const result = resolveSourceIdentityToEpisodeNumbers({
    anime: { id: 1, title_romaji: "Overlord II", format: "TV" },
    episodes: [{ number: 1 }, { number: 2 }, { number: 3 }],
    source_identity: {
      scheme: "season",
      season: 2,
      episode_numbers: [3],
      label: "S02E03",
    },
  });
  assertEquals(result?.episode_numbers, [3]);
  assertEquals(result?.anime_id, 1);
});

it("resolveSourceIdentityToEpisodeNumbers: S00 refuses to resolve into regular TV entry", () => {
  const result = resolveSourceIdentityToEpisodeNumbers({
    anime: { id: 1, title_romaji: "Show", format: "TV" },
    episodes: [{ number: 1 }, { number: 2 }, { number: 3 }],
    source_identity: {
      scheme: "season",
      season: 0,
      episode_numbers: [3],
      label: "S00E03",
    },
  });
  assertEquals(result, undefined);
});

it("resolveSourceIdentityToEpisodeNumbers: S00 resolves into OVA entry", () => {
  const result = resolveSourceIdentityToEpisodeNumbers({
    anime: { id: 2, title_romaji: "Show OVA", format: "OVA" },
    episodes: [{ number: 1 }, { number: 2 }, { number: 3 }],
    source_identity: {
      scheme: "season",
      season: 0,
      episode_numbers: [3],
      label: "S00E03",
    },
  });
  assertEquals(result?.episode_numbers, [3]);
});

it("resolveSourceIdentityToEpisodeNumbers: daily identity resolves by aired date", () => {
  const result = resolveSourceIdentityToEpisodeNumbers({
    anime: { id: 1, title_romaji: "Show" },
    episodes: [
      { number: 177, aired: "2025-03-13" },
      { number: 178, aired: "2025-03-14" },
      { number: 179, aired: "2025-03-15" },
    ],
    source_identity: {
      scheme: "daily",
      air_dates: ["2025-03-14"],
      label: "2025-03-14",
    },
  });
  assertEquals(result?.episode_numbers, [178]);
  assertEquals(result?.primary_episode_number, 178);
});

it("resolveSourceIdentityToEpisodeNumbers: daily identity returns undefined when no match", () => {
  const result = resolveSourceIdentityToEpisodeNumbers({
    anime: { id: 1, title_romaji: "Show" },
    episodes: [{ number: 1, aired: "2025-01-01" }],
    source_identity: {
      scheme: "daily",
      air_dates: ["2025-12-25"],
      label: "2025-12-25",
    },
  });
  assertEquals(result, undefined);
});

// ---------------------------------------------------------------------------
// Candidate ranking tests (Issue 2)
// ---------------------------------------------------------------------------

it("rankAnimeCandidates: prefers Overlord II for S02 source", () => {
  const parsed = parseFileSourceIdentity("Overlord.S02E03.mkv");
  const result = rankAnimeCandidates({
    parsed,
    candidates: [
      { id: 1, title_romaji: "Overlord", format: "TV" },
      { id: 2, title_romaji: "Overlord II", format: "TV" },
    ],
  });
  assertEquals(result?.id, 2);
});

it("rankAnimeCandidates: prefers OVA entry for S00 source", () => {
  const parsed = parseFileSourceIdentity("Show.S00E03.mkv");
  const result = rankAnimeCandidates({
    parsed,
    candidates: [
      { id: 1, title_romaji: "Show", format: "TV" },
      { id: 2, title_romaji: "Show OVA", format: "OVA" },
    ],
  });
  assertEquals(result?.id, 2);
});

it("rankAnimeCandidates: folder sequel hint prefers matching entry", () => {
  const context = buildPathParseContext("/library", "/library/Overlord II/03.mkv");
  const parsed = parseFileSourceIdentity("/library/Overlord II/03.mkv", context);
  const result = rankAnimeCandidates({
    parsed,
    candidates: [
      { id: 1, title_romaji: "Overlord", format: "TV" },
      { id: 2, title_romaji: "Overlord II", format: "TV" },
    ],
    context,
  });
  assertEquals(result?.id, 2);
});
