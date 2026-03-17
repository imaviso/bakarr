import { assertEquals } from "@std/assert";
import { type NamingInput, renderEpisodeFilename } from "./naming.ts";

function makeInput(overrides: Partial<NamingInput> = {}): NamingInput {
  return {
    title: "My Anime",
    episodeNumbers: [5],
    ...overrides,
  };
}

Deno.test("naming: {title} renders anime title", () => {
  assertEquals(
    renderEpisodeFilename("{title}", makeInput({ title: "Naruto" })),
    "Naruto",
  );
});

Deno.test("naming: {title} sanitizes filesystem-unsafe characters", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title}",
      makeInput({ title: 'Re:Zero / "Another"' }),
    ),
    "Re Zero Another",
  );
});

Deno.test("naming: {episode} pads to 2 digits by default", () => {
  assertEquals(
    renderEpisodeFilename("{episode}", makeInput({ episodeNumbers: [5] })),
    "05",
  );
});

Deno.test("naming: {episode:02} pads to 2 digits", () => {
  assertEquals(
    renderEpisodeFilename("{episode:02}", makeInput({ episodeNumbers: [3] })),
    "03",
  );
});

Deno.test("naming: {episode:03} pads to 3 digits", () => {
  assertEquals(
    renderEpisodeFilename("{episode:03}", makeInput({ episodeNumbers: [5] })),
    "005",
  );
});

Deno.test("naming: {episode} with large number does not truncate", () => {
  assertEquals(
    renderEpisodeFilename("{episode}", makeInput({ episodeNumbers: [142] })),
    "142",
  );
});

Deno.test("naming: {episode} with no episodes uses 0", () => {
  assertEquals(
    renderEpisodeFilename("{episode}", makeInput({ episodeNumbers: [] })),
    "00",
  );
});

Deno.test("naming: {episode_segment} single episode", () => {
  assertEquals(
    renderEpisodeFilename(
      "{episode_segment}",
      makeInput({ episodeNumbers: [3] }),
    ),
    "03",
  );
});

Deno.test("naming: {episode_segment} multi-episode range", () => {
  assertEquals(
    renderEpisodeFilename(
      "{episode_segment}",
      makeInput({ episodeNumbers: [3, 4] }),
    ),
    "03-04",
  );
});

Deno.test("naming: {episode_segment} episode >= 100 uses 3-digit pad", () => {
  assertEquals(
    renderEpisodeFilename(
      "{episode_segment}",
      makeInput({ episodeNumbers: [142] }),
    ),
    "142",
  );
});

Deno.test("naming: {source_episode_segment} uses source label when available", () => {
  assertEquals(
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

Deno.test("naming: {source_episode_segment} falls back to segment when no source", () => {
  assertEquals(
    renderEpisodeFilename(
      "{source_episode_segment}",
      makeInput({ episodeNumbers: [7] }),
    ),
    "07",
  );
});

Deno.test("naming: {season} pads to 2 digits by default", () => {
  assertEquals(
    renderEpisodeFilename("{season}", makeInput({ season: 2 })),
    "02",
  );
});

Deno.test("naming: {season:02} pads to 2 digits", () => {
  assertEquals(
    renderEpisodeFilename("{season:02}", makeInput({ season: 1 })),
    "01",
  );
});

Deno.test("naming: {season} defaults to 1 when not provided", () => {
  assertEquals(renderEpisodeFilename("{season}", makeInput()), "01");
});

Deno.test("naming: {air_date} renders date", () => {
  assertEquals(
    renderEpisodeFilename("{air_date}", makeInput({ airDate: "2025-03-14" })),
    "2025-03-14",
  );
});

Deno.test("naming: {air_date} renders empty when not provided", () => {
  assertEquals(renderEpisodeFilename("{air_date}", makeInput()), "");
});

Deno.test("naming: {group} renders release group", () => {
  assertEquals(
    renderEpisodeFilename("{group}", makeInput({ group: "SubsPlease" })),
    "SubsPlease",
  );
});

Deno.test("naming: {group} renders empty when not provided", () => {
  assertEquals(renderEpisodeFilename("{group}", makeInput()), "");
});

Deno.test("naming: {resolution} renders resolution", () => {
  assertEquals(
    renderEpisodeFilename("{resolution}", makeInput({ resolution: "1080p" })),
    "1080p",
  );
});

Deno.test("naming: {resolution} renders empty when not provided", () => {
  assertEquals(renderEpisodeFilename("{resolution}", makeInput()), "");
});

Deno.test("naming: default format '{title} - {episode_segment}'", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [5] }),
    ),
    "Naruto - 05",
  );
});

Deno.test("naming: complex format with all tokens", () => {
  assertEquals(
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

Deno.test("naming: format with multiple episode tokens", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} - {episode_segment} ({episode:03})",
      makeInput({ title: "Bleach", episodeNumbers: [5] }),
    ),
    "Bleach - 05 (005)",
  );
});

Deno.test("naming: cleans up dangling separator when group is empty", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} - {episode_segment} - {group}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

Deno.test("naming: cleans up leading separator when title token is first and empty optional follows", () => {
  assertEquals(
    renderEpisodeFilename(
      "{group} - {title} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

Deno.test("naming: cleans up multiple dangling separators", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} - {group} - {resolution} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

Deno.test("naming: token used multiple times in format", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title}/{title} - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [5] }),
    ),
    "Naruto/Naruto - 05",
  );
});

Deno.test("naming: unknown tokens are left as-is", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} - {unknown_token}",
      makeInput({ title: "Naruto" }),
    ),
    "Naruto - {unknown_token}",
  );
});

// ---------------------------------------------------------------------------
// Sonarr-style realistic filenames
// ---------------------------------------------------------------------------

Deno.test("naming: JoJo Sonarr-style S{season}E{episode} with apostrophe and year in title", () => {
  assertEquals(
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

Deno.test("naming: JoJo with source_episode_segment from parsed identity", () => {
  assertEquals(
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

Deno.test("naming: JoJo with empty optional tokens cleans up empty brackets", () => {
  assertEquals(
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

Deno.test("naming: Nukitashi Sonarr-style with group and resolution", () => {
  assertEquals(
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

Deno.test("naming: Nukitashi with source_episode_segment", () => {
  assertEquals(
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

Deno.test("naming: partial optional tokens — group filled, resolution empty", () => {
  assertEquals(
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

Deno.test("naming: {episode_title} renders episode title", () => {
  assertEquals(
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

Deno.test("naming: {episode_title} empty when not provided", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} - {episode_segment} - {episode_title}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

Deno.test("naming: {year} renders start year", () => {
  assertEquals(
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

Deno.test("naming: {year} empty cleans up parentheses", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} ({year}) - {episode_segment}",
      makeInput({ title: "Naruto", episodeNumbers: [1] }),
    ),
    "Naruto - 01",
  );
});

Deno.test("naming: {quality} renders quality source", () => {
  assertEquals(
    renderEpisodeFilename("{quality}", makeInput({ quality: "WEB-DL" })),
    "WEB-DL",
  );
});

Deno.test("naming: {quality} empty when not provided", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} - {quality}",
      makeInput({ title: "Naruto" }),
    ),
    "Naruto",
  );
});

Deno.test("naming: {video_codec} renders codec", () => {
  assertEquals(
    renderEpisodeFilename("[{video_codec}]", makeInput({ videoCodec: "x265" })),
    "[x265]",
  );
});

Deno.test("naming: {video_codec} empty cleans up brackets", () => {
  assertEquals(
    renderEpisodeFilename(
      "{title} [{video_codec}]",
      makeInput({ title: "Naruto" }),
    ),
    "Naruto",
  );
});

Deno.test("naming: {audio_codec} renders codec", () => {
  assertEquals(
    renderEpisodeFilename("[{audio_codec}]", makeInput({ audioCodec: "FLAC" })),
    "[FLAC]",
  );
});

Deno.test("naming: {audio_channels} renders channel layout", () => {
  assertEquals(
    renderEpisodeFilename(
      "[{audio_channels}]",
      makeInput({ audioChannels: "2.0" }),
    ),
    "[2.0]",
  );
});

Deno.test("naming: full JoJo Sonarr-style with episode title and codecs", () => {
  assertEquals(
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

Deno.test("naming: full Nukitashi Sonarr-style with all new tokens", () => {
  assertEquals(
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
