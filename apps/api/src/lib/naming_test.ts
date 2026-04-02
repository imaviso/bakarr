import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { type NamingInput, renderEpisodeFilename } from "@/lib/naming.ts";

function makeInput(overrides: Partial<NamingInput> = {}): NamingInput {
  return {
    title: "My Anime",
    episodeNumbers: [5],
    ...overrides,
  };
}

it("naming: {title} renders anime title", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{title}", makeInput({ title: "Naruto" })),
    "Naruto",
  );
});

it("naming: {title} sanitizes filesystem-unsafe characters", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{title}", makeInput({ title: 'Re:Zero / "Another"' })),
    "Re Zero Another",
  );
});

it("naming: {episode} pads to 2 digits by default", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode}", makeInput({ episodeNumbers: [5] })),
    "05",
  );
});

it("naming: {episode:02} pads to 2 digits", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode:02}", makeInput({ episodeNumbers: [3] })),
    "03",
  );
});

it("naming: {episode:03} pads to 3 digits", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode:03}", makeInput({ episodeNumbers: [5] })),
    "005",
  );
});

it("naming: {episode} with large number does not truncate", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode}", makeInput({ episodeNumbers: [142] })),
    "142",
  );
});

it("naming: {episode} with no episodes uses 0", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode}", makeInput({ episodeNumbers: [] })),
    "00",
  );
});

it("naming: {episode_segment} single episode", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode_segment}", makeInput({ episodeNumbers: [3] })),
    "03",
  );
});

it("naming: {episode_segment} multi-episode range", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode_segment}", makeInput({ episodeNumbers: [3, 4] })),
    "03-04",
  );
});

it("naming: {episode_segment} episode >= 100 uses 3-digit pad", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{episode_segment}", makeInput({ episodeNumbers: [142] })),
    "142",
  );
});

it("naming: {source_episode_segment} uses source label when available", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{source_episode_segment}",
      makeInput({
        episodeNumbers: [3],
        sourceIdentity: {
          scheme: "absolute",
          label: "S02E03",
          episode_numbers: [3],
        },
      }),
    ),
    "S02E03",
  );
});

it("naming: {source_episode_segment} falls back to segment when no source", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{source_episode_segment}", makeInput({ episodeNumbers: [7] })),
    "07",
  );
});

it("naming: {season} pads to 2 digits by default", () => {
  assert.deepStrictEqual(renderEpisodeFilename("{season}", makeInput({ season: 2 })), "02");
});

it("naming: {season:02} pads to 2 digits", () => {
  assert.deepStrictEqual(renderEpisodeFilename("{season:02}", makeInput({ season: 1 })), "01");
});

it("naming: {season} renders empty when not provided", () => {
  assert.deepStrictEqual(renderEpisodeFilename("{season}", makeInput()), "");
});

it("naming: {air_date} renders date", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{air_date}", makeInput({ airDate: "2025-03-14" })),
    "2025-03-14",
  );
});

it("naming: {air_date} renders empty when not provided", () => {
  assert.deepStrictEqual(renderEpisodeFilename("{air_date}", makeInput()), "");
});

it("naming: {group} renders release group", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{group}", makeInput({ group: "SubsPlease" })),
    "SubsPlease",
  );
});

it("naming: {group} renders empty when not provided", () => {
  assert.deepStrictEqual(renderEpisodeFilename("{group}", makeInput()), "");
});

it("naming: {resolution} renders resolution", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{resolution}", makeInput({ resolution: "1080p" })),
    "1080p",
  );
});

it("naming: {resolution} renders empty when not provided", () => {
  assert.deepStrictEqual(renderEpisodeFilename("{resolution}", makeInput()), "");
});

it("naming: default format '{title} - {episode_segment}'", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [5] }),
    ),
    "Naruto - 05",
  );
});

it("naming: complex format with all tokens", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - S{season:02}E{episode:02} - [{group}] [{resolution}]",
      makeInput({
        title: "Naruto",
        episodeNumbers: [12],
        season: 2,
        group: "SubsPlease",
        resolution: "1080p",
      }),
    ),
    "Naruto - S02E12 - [SubsPlease] [1080p]",
  );
});

it("naming: format with multiple episode tokens", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {episode_segment} ({episode:03})",
      makeInput({ title: "Bleach", episodeNumbers: [5] }),
    ),
    "Bleach - 05 (005)",
  );
});

it("naming: cleans up dangling separator when group is empty", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {episode_segment} - {group}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

it("naming: cleans up leading separator when title token is first and empty optional follows", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{group} - {title} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

it("naming: cleans up multiple dangling separators", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {group} - {resolution} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

it("naming: token used multiple times in format", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title}/{title} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [5] }),
    ),
    "Naruto/Naruto - 05",
  );
});

it("naming: unknown tokens are left as-is", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{title} - {unknown_token}", makeInput({ title: "Naruto" })),
    "Naruto - {unknown_token}",
  );
});

// ---------------------------------------------------------------------------
// Sonarr-style realistic filenames
// ---------------------------------------------------------------------------

it("naming: JoJo Sonarr-style S{season}E{episode} with apostrophe and year in title", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - S{season:02}E{episode:02} [{group}][{resolution}]",
      makeInput({
        title: "JoJo's Bizarre Adventure (2012)",
        episodeNumbers: [1],
        season: 2,
        group: "HDTV",
        resolution: "1080p",
      }),
    ),
    "JoJo's Bizarre Adventure (2012) - S02E01 [HDTV][1080p]",
  );
});

it("naming: JoJo with source_episode_segment from parsed identity", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {source_episode_segment} [{group}][{resolution}]",
      makeInput({
        title: "JoJo's Bizarre Adventure (2012)",
        episodeNumbers: [1],
        season: 2,
        sourceIdentity: {
          scheme: "season",
          label: "S02E01",
          episode_numbers: [1],
          season: 2,
        },
        group: "HDTV",
        resolution: "1080p",
      }),
    ),
    "JoJo's Bizarre Adventure (2012) - S02E01 [HDTV][1080p]",
  );
});

it("naming: JoJo with empty optional tokens cleans up empty brackets", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - S{season:02}E{episode:02} - [{group}][{resolution}]",
      makeInput({
        title: "JoJo's Bizarre Adventure (2012)",
        episodeNumbers: [1],
        season: 2,
      }),
    ),
    "JoJo's Bizarre Adventure (2012) - S02E01",
  );
});

it("naming: Nukitashi Sonarr-style with group and resolution", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - S{season:02}E{episode:02} [{group}][{resolution}]",
      makeInput({
        title: "Nukitashi The Animation",
        episodeNumbers: [2],
        season: 1,
        group: "ToonsHub",
        resolution: "1080p",
      }),
    ),
    "Nukitashi The Animation - S01E02 [ToonsHub][1080p]",
  );
});

it("naming: Nukitashi with source_episode_segment", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {source_episode_segment} [{group}][{resolution}]",
      makeInput({
        title: "Nukitashi The Animation",
        episodeNumbers: [2],
        season: 1,
        sourceIdentity: {
          scheme: "season",
          label: "S01E02",
          episode_numbers: [2],
          season: 1,
        },
        group: "ToonsHub",
        resolution: "1080p",
      }),
    ),
    "Nukitashi The Animation - S01E02 [ToonsHub][1080p]",
  );
});

it("naming: partial optional tokens — group filled, resolution empty", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - S{season:02}E{episode:02} [{group}][{resolution}]",
      makeInput({
        title: "Nukitashi The Animation",
        episodeNumbers: [2],
        season: 1,
        group: "ToonsHub",
      }),
    ),
    "Nukitashi The Animation - S01E02 [ToonsHub]",
  );
});

it("naming: {episode_title} renders episode title", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {episode_segment} - {episode_title}",
      makeInput({
        title: "JoJo's Bizarre Adventure",
        episodeNumbers: [1],
        episodeTitle: "A Man Possessed by an Evil Spirit",
      }),
    ),
    "JoJo's Bizarre Adventure - 01 - A Man Possessed by an Evil Spirit",
  );
});

it("naming: {episode_title} empty when not provided", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - {episode_segment} - {episode_title}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

it("naming: {year} renders start year", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} ({year}) - {episode_segment}",
      makeInput({
        title: "JoJo's Bizarre Adventure",
        episodeNumbers: [1],
        year: 2012,
      }),
    ),
    "JoJo's Bizarre Adventure (2012) - 01",
  );
});

it("naming: {year} empty cleans up parentheses", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} ({year}) - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

it("naming: {quality} renders quality source", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{quality}", makeInput({ quality: "WEB-DL" })),
    "WEB-DL",
  );
});

it("naming: {quality} empty when not provided", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{title} - {quality}", makeInput({ title: "Naruto" })),
    "Naruto",
  );
});

it("naming: {quality} omits duplicated resolution when {resolution} is present", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - [{quality} {resolution}]",
      makeInput({
        title: "Jigokuraku",
        quality: "WEB-DL 1080p",
        resolution: "1080p",
      }),
    ),
    "Jigokuraku - [WEB-DL 1080p]",
  );
});

it("naming: {quality} can become empty when it only repeats resolution", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - [{quality} {resolution}]",
      makeInput({
        title: "Show",
        quality: "1080p",
        resolution: "1080p",
      }),
    ),
    "Show - [1080p]",
  );
});

it("naming: {video_codec} renders codec", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("[{video_codec}]", makeInput({ videoCodec: "x265" })),
    "[x265]",
  );
});

it("naming: {video_codec} empty cleans up brackets", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("{title} [{video_codec}]", makeInput({ title: "Naruto" })),
    "Naruto",
  );
});

it("naming: {audio_codec} renders codec", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("[{audio_codec}]", makeInput({ audioCodec: "FLAC" })),
    "[FLAC]",
  );
});

it("naming: {audio_channels} renders channel layout", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename("[{audio_channels}]", makeInput({ audioChannels: "2.0" })),
    "[2.0]",
  );
});

it("naming: full JoJo Sonarr-style with episode title and codecs", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} ({year}) - S{season:02}E{episode:02} - {episode_title} [{quality}-{resolution}][{audio_codec} {audio_channels}][{video_codec}]",
      makeInput({
        title: "JoJo's Bizarre Adventure",
        episodeNumbers: [1],
        season: 2,
        year: 2012,
        episodeTitle: "A Man Possessed by an Evil Spirit",
        quality: "HDTV",
        resolution: "1080p",
        audioCodec: "FLAC",
        audioChannels: "2.1",
        videoCodec: "x265",
      }),
    ),
    "JoJo's Bizarre Adventure (2012) - S02E01 - A Man Possessed by an Evil Spirit [HDTV-1080p][FLAC 2.1][x265]",
  );
});

it("naming: full Nukitashi Sonarr-style with all new tokens", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - S{season:02}E{episode:02} - {episode_title} [{quality}-{resolution}][{audio_codec} {audio_channels}][{video_codec}] - [{group}]",
      makeInput({
        title: "Nukitashi The Animation",
        episodeNumbers: [2],
        season: 1,
        episodeTitle: "The Savior",
        quality: "WEB-DL",
        resolution: "1080p",
        audioCodec: "AAC",
        audioChannels: "2.0",
        videoCodec: "H.264",
        group: "ToonsHub",
      }),
    ),
    "Nukitashi The Animation - S01E02 - The Savior [WEB-DL-1080p][AAC 2.0][H.264] - [ToonsHub]",
  );
});

it("naming: wrapped segments collapse empty inner tokens", () => {
  assert.deepStrictEqual(
    renderEpisodeFilename(
      "{title} - [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}][{group}]",
      makeInput({
        title: "Nisemonogatari",
        episodeNumbers: [1],
        audioCodec: "AAC",
        group: "MTBB",
        resolution: "1080p",
        videoCodec: "HEVC",
      }),
    ),
    "Nisemonogatari - [1080p][HEVC][AAC][MTBB]",
  );
});
