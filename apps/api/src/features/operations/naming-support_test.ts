import assert from "node:assert/strict";
import { it } from "@effect/vitest";

import {
  buildCanonicalEpisodeNamingInput,
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
  buildEpisodeFilenamePlan,
  buildEpisodeNamingInputFromPath,
  inspectNamingFormat,
  mergeDownloadSourceMetadata,
  resolveFilenameRenderPlan,
  selectAnimeTitleForNaming,
  selectAnimeTitleForNamingDetails,
  selectAnimeYearForNaming,
  selectNamingFormat,
  validateNamingMetadata,
} from "@/features/operations/naming-support.ts";

it("buildEpisodeNamingInputFromPath extracts local filename metadata for rename tokens", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeStartDate: "2012-01-08",
    animeTitle: "Nisemonogatari",
    episodeNumbers: [1],
    filePath:
      "/mnt/media2/Shows/Nisemonogatari (2012)/Season 1/Nisemonogatari - S01E01 - Karen Bee, Part 1 -[1920x1080]-[hevc]-[aac][MTBB].mkv",
    rootFolder: "/mnt/media2/Shows/Nisemonogatari (2012)",
  });

  assert.deepStrictEqual(input.episodeTitle, "Karen Bee, Part 1");
  assert.deepStrictEqual(input.group, "MTBB");
  assert.deepStrictEqual(input.quality, undefined);
  assert.deepStrictEqual(input.resolution, "1080p");
  assert.deepStrictEqual(input.season, 1);
  assert.deepStrictEqual(input.videoCodec, "HEVC");
  assert.deepStrictEqual(input.audioCodec, "AAC");
  assert.deepStrictEqual(input.audioChannels, undefined);
  assert.deepStrictEqual(input.year, 2012);
});

it("buildEpisodeNamingInputFromPath keeps stored episode title over filename fallback", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeTitle: "Show Name",
    episodeNumbers: [1],
    episodeTitle: "Canonical Episode Title",
    filePath: "/library/Show Name - S01E01 - Source Episode Title [1080p].mkv",
  });

  assert.deepStrictEqual(input.episodeTitle, "Canonical Episode Title");
});

it("selectAnimeTitleForNaming honors preferred title with fallback", () => {
  assert.deepStrictEqual(
    selectAnimeTitleForNaming(
      {
        titleEnglish: "English Title",
        titleNative: "Native Title",
        titleRomaji: "Romaji Title",
      },
      "english",
    ),
    "English Title",
  );

  assert.deepStrictEqual(
    selectAnimeTitleForNaming(
      {
        titleEnglish: null,
        titleNative: "Native Title",
        titleRomaji: "Romaji Title",
      },
      "english",
    ),
    "Romaji Title",
  );

  assert.deepStrictEqual(
    selectAnimeTitleForNaming(
      {
        titleEnglish: "English Title",
        titleNative: "Native Title",
        titleRomaji: "Romaji Title",
      },
      "native",
    ),
    "Native Title",
  );
});

it("selectAnimeTitleForNamingDetails reports which title source won", () => {
  assert.deepStrictEqual(
    selectAnimeTitleForNamingDetails(
      {
        titleEnglish: null,
        titleNative: "Native Title",
        titleRomaji: "Romaji Title",
      },
      "english",
    ),
    {
      source: "fallback_romaji",
      title: "Romaji Title",
    },
  );
});

it("selectNamingFormat uses movie format only for movies", () => {
  const settings = {
    movieNamingFormat: "{title} ({year})",
    namingFormat: "{title} - {episode_segment}",
  };

  assert.deepStrictEqual(selectNamingFormat({ format: "MOVIE" }, settings), "{title} ({year})");
  assert.deepStrictEqual(
    selectNamingFormat({ format: "TV" }, settings),
    "{title} - {episode_segment}",
  );
});

it("selectAnimeYearForNaming prefers preserved year metadata", () => {
  assert.deepStrictEqual(
    selectAnimeYearForNaming({
      endDate: "2017-01-01",
      endYear: 2017,
      startDate: null,
      startYear: 2016,
    }),
    2016,
  );
});

it("inspectNamingFormat and validation identify missing fields", () => {
  assert.deepStrictEqual(inspectNamingFormat("{title} - S{season:02}E{episode:02}"), [
    "title",
    "season",
    "episode",
  ]);

  const validation = validateNamingMetadata("{title} - S{season:02}E{episode:02}", {
    episodeNumbers: [1],
    title: "Naruto",
  });

  assert.deepStrictEqual(validation.missingFields, ["season"]);
});

it("resolveFilenameRenderPlan falls back when critical tokens are missing", () => {
  const result = resolveFilenameRenderPlan({
    animeFormat: "TV",
    format: "{title} - S{season:02}E{episode:02}",
    metadata: {
      episodeNumbers: [1],
      title: "Naruto",
    },
  });

  assert.deepStrictEqual(result.fallbackUsed, true);
  assert.deepStrictEqual(result.formatUsed, "{title} - {episode_segment}");
});

it("buildCanonicalEpisodeNamingInput prefers DB data and preserves daily air date", () => {
  const result = buildCanonicalEpisodeNamingInput({
    animeStartDate: "2025-01-01",
    animeStartYear: 2025,
    animeTitle: "Show Name",
    downloadSourceMetadata: {
      air_date: "2025-03-14",
      source_identity: {
        air_dates: ["2025-03-14"],
        label: "2025-03-14",
        scheme: "daily",
      },
    },
    episodeNumbers: [1],
    episodeRows: [{ aired: "2025-03-14T12:00:00.000Z", title: "DB Title" }],
    filePath: "/downloads/Show.2025-03-14.mkv",
  });

  assert.deepStrictEqual(result.namingInput.airDate, "2025-03-14");
  assert.deepStrictEqual(result.namingInput.episodeTitle, "DB Title");
  assert.deepStrictEqual(result.namingInput.year, 2025);
});

it("buildCanonicalEpisodeNamingInput warns on ambiguous multi-episode metadata", () => {
  const result = buildCanonicalEpisodeNamingInput({
    animeStartDate: "2025-01-01",
    animeTitle: "Show Name",
    episodeNumbers: [1, 2],
    episodeRows: [
      { aired: "2025-01-01", title: "Part A" },
      { aired: "2025-01-08", title: "Part B" },
    ],
    filePath: "/downloads/Show - 01-02.mkv",
  });

  assert.deepStrictEqual(result.namingInput.episodeTitle, undefined);
  assert.deepStrictEqual(result.namingInput.airDate, undefined);
  assert.deepStrictEqual(result.warnings.length, 2);
});

it("buildEpisodeFilenamePlan exposes fallback and warning details", () => {
  const plan = buildEpisodeFilenamePlan({
    animeRow: {
      format: "TV",
      rootFolder: "/library/Show",
      startDate: "2025-01-01",
      startYear: 2025,
      titleRomaji: "Show",
    },
    episodeNumbers: [1],
    filePath: "/downloads/Show - 01.mkv",
    namingFormat: "{title} - S{season:02}E{episode:02}",
    preferredTitle: "romaji",
  });

  assert.deepStrictEqual(plan.baseName, "Show - 01");
  assert.deepStrictEqual(plan.fallbackUsed, true);
  assert.deepStrictEqual(plan.missingFields, ["season"]);
});

it("buildEpisodeFilenamePlan fills media tokens from local metadata when heuristics are weak", () => {
  const plan = buildEpisodeFilenamePlan({
    animeRow: {
      format: "TV",
      rootFolder: "/library/Show",
      titleRomaji: "Show",
    },
    episodeNumbers: [1],
    filePath: "/downloads/download.mkv",
    localMediaMetadata: {
      audio_channels: "2.0",
      audio_codec: "AAC",
      resolution: "1080p",
      video_codec: "HEVC",
    },
    namingFormat:
      "{title} - {episode_segment} [{resolution}][{video_codec}][{audio_codec} {audio_channels}]",
    preferredTitle: "romaji",
  });

  assert.deepStrictEqual(plan.baseName, "Show - 01 [1080p][HEVC][AAC 2.0]");
  assert.deepStrictEqual(plan.metadataSnapshot.video_codec, "HEVC");
  assert.deepStrictEqual(plan.metadataSnapshot.audio_channels, "2.0");
});

it("buildDownloadSourceMetadataFromRelease extracts provenance from release title", () => {
  const metadata = buildDownloadSourceMetadataFromRelease({
    chosenFromSeadex: true,
    group: "SubsPlease",
    indexer: "Nyaa",
    previousQuality: "WEB-DL 720p",
    previousScore: 7,
    selectionKind: "upgrade",
    selectionScore: 12,
    sourceUrl: "https://nyaa.si/view/1",
    title: "[SubsPlease] Show - 01 (1080p) [HEVC] [AAC 2.0]",
    trusted: true,
  });

  assert.deepStrictEqual(metadata.chosen_from_seadex, true);
  assert.deepStrictEqual(metadata.group, "SubsPlease");
  assert.deepStrictEqual(metadata.indexer, "Nyaa");
  assert.deepStrictEqual(metadata.previous_quality, "WEB-DL 720p");
  assert.deepStrictEqual(metadata.previous_score, 7);
  assert.deepStrictEqual(metadata.resolution, "1080p");
  assert.deepStrictEqual(metadata.selection_kind, "upgrade");
  assert.deepStrictEqual(metadata.selection_score, 12);
  assert.deepStrictEqual(metadata.video_codec, "HEVC");
  assert.deepStrictEqual(metadata.audio_codec, "AAC");
});

it("buildDownloadSourceMetadataFromRelease expands heuristic coverage for BluRay and codec tags", () => {
  const metadata = buildDownloadSourceMetadataFromRelease({
    title: "[Group] Movie Title (2025) [BDMV 2160p] [VP9] [TrueHD 6ch]",
  });

  assert.deepStrictEqual(metadata.quality, "BluRay");
  assert.deepStrictEqual(metadata.resolution, "2160p");
  assert.deepStrictEqual(metadata.video_codec, "VP9");
  assert.deepStrictEqual(metadata.audio_codec, "TrueHD");
  assert.deepStrictEqual(metadata.audio_channels, "5.1");
});

it("buildDownloadSourceMetadataFromRelease marks BD releases as BluRay", () => {
  const metadata = buildDownloadSourceMetadataFromRelease({
    title: "Jigokuraku - S01E01 v2 (BD 1080p HEVC) [Vodes]",
  });

  assert.deepStrictEqual(metadata.quality, "BluRay");
  assert.deepStrictEqual(metadata.resolution, "1080p");
  assert.deepStrictEqual(metadata.video_codec, "HEVC");
});

it("buildEpisodeNamingInputFromPath recognizes plain WEB releases and 2ch audio", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeTitle: "Show Name",
    episodeNumbers: [1],
    filePath: "/downloads/[Group] Show Name - 01 [WEB 1080p] [VP9] [Opus 2ch].mkv",
  });

  assert.deepStrictEqual(input.quality, "WEB");
  assert.deepStrictEqual(input.videoCodec, "VP9");
  assert.deepStrictEqual(input.audioCodec, "Opus");
  assert.deepStrictEqual(input.audioChannels, "2.0");
});

it("mergeDownloadSourceMetadata preserves baseline fields and overlays UI metadata", () => {
  const merged = mergeDownloadSourceMetadata(
    {
      group: "SubsPlease",
      indexer: "Nyaa",
      parsed_title: "[SubsPlease] Show - 01 (1080p)",
      resolution: "1080p",
      source_identity: {
        episode_numbers: [1],
        label: "01",
        scheme: "absolute",
      },
    },
    {
      chosen_from_seadex: true,
      previous_quality: "WEB-DL 720p",
      previous_score: 7,
      selection_kind: "upgrade",
      selection_score: 12,
      source_url: "https://nyaa.si/view/1",
      trusted: true,
    },
  );

  assert.deepStrictEqual(merged.chosen_from_seadex, true);
  assert.deepStrictEqual(merged.group, "SubsPlease");
  assert.deepStrictEqual(merged.indexer, "Nyaa");
  assert.deepStrictEqual(merged.previous_quality, "WEB-DL 720p");
  assert.deepStrictEqual(merged.previous_score, 7);
  assert.deepStrictEqual(merged.resolution, "1080p");
  assert.deepStrictEqual(merged.selection_kind, "upgrade");
  assert.deepStrictEqual(merged.selection_score, 12);
  assert.deepStrictEqual(merged.source_identity, {
    episode_numbers: [1],
    label: "01",
    scheme: "absolute",
  });
  assert.deepStrictEqual(merged.source_url, "https://nyaa.si/view/1");
  assert.deepStrictEqual(merged.trusted, true);
});

it("buildDownloadSelectionMetadata extracts compact ranking context", () => {
  const upgrade = buildDownloadSelectionMetadata({
    Upgrade: {
      is_seadex: true,
      old_quality: {
        id: 6,
        name: "WEB-DL 720p",
        rank: 10,
        resolution: 720,
        source: "web",
      },
      old_score: 7,
      quality: {
        id: 4,
        name: "WEB-DL 1080p",
        rank: 7,
        resolution: 1080,
        source: "web",
      },
      reason: "better quality available",
      score: 12,
    },
  });
  const accept = buildDownloadSelectionMetadata({
    Accept: {
      is_seadex: false,
      quality: {
        id: 4,
        name: "WEB-DL 1080p",
        rank: 7,
        resolution: 1080,
        source: "web",
      },
      score: 12,
    },
  });

  assert.deepStrictEqual(upgrade, {
    chosen_from_seadex: true,
    previous_quality: "WEB-DL 720p",
    previous_score: 7,
    selection_kind: "upgrade",
    selection_score: 12,
  });
  assert.deepStrictEqual(accept, {
    chosen_from_seadex: undefined,
    selection_kind: "accept",
    selection_score: 12,
  });
});
