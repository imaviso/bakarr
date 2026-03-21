import { assertEquals } from "@std/assert";

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
} from "./naming-support.ts";

Deno.test("buildEpisodeNamingInputFromPath extracts local filename metadata for rename tokens", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeStartDate: "2012-01-08",
    animeTitle: "Nisemonogatari",
    episodeNumbers: [1],
    filePath:
      "/mnt/media2/Shows/Nisemonogatari (2012)/Season 1/Nisemonogatari - S01E01 - Karen Bee, Part 1 -[1920x1080]-[hevc]-[aac][MTBB].mkv",
    rootFolder: "/mnt/media2/Shows/Nisemonogatari (2012)",
  });

  assertEquals(input.episodeTitle, "Karen Bee, Part 1");
  assertEquals(input.group, "MTBB");
  assertEquals(input.quality, undefined);
  assertEquals(input.resolution, "1080p");
  assertEquals(input.season, 1);
  assertEquals(input.videoCodec, "HEVC");
  assertEquals(input.audioCodec, "AAC");
  assertEquals(input.audioChannels, undefined);
  assertEquals(input.year, 2012);
});

Deno.test("buildEpisodeNamingInputFromPath keeps stored episode title over filename fallback", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeTitle: "Show Name",
    episodeNumbers: [1],
    episodeTitle: "Canonical Episode Title",
    filePath: "/library/Show Name - S01E01 - Source Episode Title [1080p].mkv",
  });

  assertEquals(input.episodeTitle, "Canonical Episode Title");
});

Deno.test("selectAnimeTitleForNaming honors preferred title with fallback", () => {
  assertEquals(
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

  assertEquals(
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

  assertEquals(
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

Deno.test("selectAnimeTitleForNamingDetails reports which title source won", () => {
  assertEquals(
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

Deno.test("selectNamingFormat uses movie format only for movies", () => {
  const settings = {
    movieNamingFormat: "{title} ({year})",
    namingFormat: "{title} - {episode_segment}",
  };

  assertEquals(
    selectNamingFormat({ format: "MOVIE" }, settings),
    "{title} ({year})",
  );
  assertEquals(
    selectNamingFormat({ format: "TV" }, settings),
    "{title} - {episode_segment}",
  );
});

Deno.test("selectAnimeYearForNaming prefers preserved year metadata", () => {
  assertEquals(
    selectAnimeYearForNaming({
      endDate: "2017-01-01",
      endYear: 2017,
      startDate: null,
      startYear: 2016,
    }),
    2016,
  );
});

Deno.test("inspectNamingFormat and validation identify missing fields", () => {
  assertEquals(inspectNamingFormat("{title} - S{season:02}E{episode:02}"), [
    "title",
    "season",
    "episode",
  ]);

  const validation = validateNamingMetadata(
    "{title} - S{season:02}E{episode:02}",
    {
      episodeNumbers: [1],
      title: "Naruto",
    },
  );

  assertEquals(validation.missingFields, ["season"]);
});

Deno.test("resolveFilenameRenderPlan falls back when critical tokens are missing", () => {
  const result = resolveFilenameRenderPlan({
    animeFormat: "TV",
    format: "{title} - S{season:02}E{episode:02}",
    metadata: {
      episodeNumbers: [1],
      title: "Naruto",
    },
  });

  assertEquals(result.fallbackUsed, true);
  assertEquals(result.formatUsed, "{title} - {episode_segment}");
});

Deno.test("buildCanonicalEpisodeNamingInput prefers DB data and preserves daily air date", () => {
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

  assertEquals(result.namingInput.airDate, "2025-03-14");
  assertEquals(result.namingInput.episodeTitle, "DB Title");
  assertEquals(result.namingInput.year, 2025);
});

Deno.test("buildCanonicalEpisodeNamingInput warns on ambiguous multi-episode metadata", () => {
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

  assertEquals(result.namingInput.episodeTitle, undefined);
  assertEquals(result.namingInput.airDate, undefined);
  assertEquals(result.warnings.length, 2);
});

Deno.test("buildEpisodeFilenamePlan exposes fallback and warning details", () => {
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

  assertEquals(plan.baseName, "Show - 01");
  assertEquals(plan.fallbackUsed, true);
  assertEquals(plan.missingFields, ["season"]);
});

Deno.test("buildEpisodeFilenamePlan fills media tokens from local metadata when heuristics are weak", () => {
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

  assertEquals(plan.baseName, "Show - 01 [1080p][HEVC][AAC 2.0]");
  assertEquals(plan.metadataSnapshot.video_codec, "HEVC");
  assertEquals(plan.metadataSnapshot.audio_channels, "2.0");
});

Deno.test("buildDownloadSourceMetadataFromRelease extracts provenance from release title", () => {
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

  assertEquals(metadata.chosen_from_seadex, true);
  assertEquals(metadata.group, "SubsPlease");
  assertEquals(metadata.indexer, "Nyaa");
  assertEquals(metadata.previous_quality, "WEB-DL 720p");
  assertEquals(metadata.previous_score, 7);
  assertEquals(metadata.resolution, "1080p");
  assertEquals(metadata.selection_kind, "upgrade");
  assertEquals(metadata.selection_score, 12);
  assertEquals(metadata.video_codec, "HEVC");
  assertEquals(metadata.audio_codec, "AAC");
});

Deno.test("buildDownloadSourceMetadataFromRelease expands heuristic coverage for BluRay and codec tags", () => {
  const metadata = buildDownloadSourceMetadataFromRelease({
    title: "[Group] Movie Title (2025) [BDMV 2160p] [VP9] [TrueHD 6ch]",
  });

  assertEquals(metadata.quality, "BluRay");
  assertEquals(metadata.resolution, "2160p");
  assertEquals(metadata.video_codec, "VP9");
  assertEquals(metadata.audio_codec, "TrueHD");
  assertEquals(metadata.audio_channels, "5.1");
});

Deno.test("buildDownloadSourceMetadataFromRelease marks BD releases as BluRay", () => {
  const metadata = buildDownloadSourceMetadataFromRelease({
    title: "Jigokuraku - S01E01 v2 (BD 1080p HEVC) [Vodes]",
  });

  assertEquals(metadata.quality, "BluRay");
  assertEquals(metadata.resolution, "1080p");
  assertEquals(metadata.video_codec, "HEVC");
});

Deno.test("buildEpisodeNamingInputFromPath recognizes plain WEB releases and 2ch audio", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeTitle: "Show Name",
    episodeNumbers: [1],
    filePath:
      "/downloads/[Group] Show Name - 01 [WEB 1080p] [VP9] [Opus 2ch].mkv",
  });

  assertEquals(input.quality, "WEB");
  assertEquals(input.videoCodec, "VP9");
  assertEquals(input.audioCodec, "Opus");
  assertEquals(input.audioChannels, "2.0");
});

Deno.test("mergeDownloadSourceMetadata preserves baseline fields and overlays UI metadata", () => {
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

  assertEquals(merged.chosen_from_seadex, true);
  assertEquals(merged.group, "SubsPlease");
  assertEquals(merged.indexer, "Nyaa");
  assertEquals(merged.previous_quality, "WEB-DL 720p");
  assertEquals(merged.previous_score, 7);
  assertEquals(merged.resolution, "1080p");
  assertEquals(merged.selection_kind, "upgrade");
  assertEquals(merged.selection_score, 12);
  assertEquals(merged.source_identity, {
    episode_numbers: [1],
    label: "01",
    scheme: "absolute",
  });
  assertEquals(merged.source_url, "https://nyaa.si/view/1");
  assertEquals(merged.trusted, true);
});

Deno.test("buildDownloadSelectionMetadata extracts compact ranking context", () => {
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

  assertEquals(upgrade, {
    chosen_from_seadex: true,
    previous_quality: "WEB-DL 720p",
    previous_score: 7,
    selection_kind: "upgrade",
    selection_score: 12,
  });
  assertEquals(accept, {
    chosen_from_seadex: undefined,
    selection_kind: "accept",
    selection_score: 12,
  });
});
