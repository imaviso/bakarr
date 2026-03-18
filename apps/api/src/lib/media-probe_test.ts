import { assertEquals } from "@std/assert";

import {
  mergeProbedMediaMetadata,
  parseFfprobeJson,
  shouldProbeMediaMetadata,
} from "./media-probe.ts";

Deno.test("parseFfprobeJson extracts canonical media metadata", () => {
  assertEquals(
    parseFfprobeJson(JSON.stringify({
      format: {
        duration: "1440.4",
      },
      streams: [
        {
          codec_name: "hevc",
          codec_type: "video",
          height: 1080,
          width: 1920,
        },
        {
          channel_layout: "stereo",
          channels: 2,
          codec_name: "aac",
          codec_type: "audio",
        },
      ],
    })),
    {
      audio_channels: "2.0",
      audio_codec: "AAC",
      duration_seconds: 1440,
      resolution: "1080p",
      video_codec: "HEVC",
    },
  );
});

Deno.test("mergeProbedMediaMetadata fills only missing fields", () => {
  assertEquals(
    mergeProbedMediaMetadata<{
      audio_channels?: string;
      audio_codec?: string;
      duration_seconds?: number;
      resolution?: string;
      video_codec?: string;
    }>({
      resolution: "720p",
      video_codec: "AVC",
    }, {
      audio_channels: "2.0",
      audio_codec: "AAC",
      duration_seconds: 1440,
      resolution: "1080p",
      video_codec: "HEVC",
    }),
    {
      audio_channels: "2.0",
      audio_codec: "AAC",
      duration_seconds: 1440,
      resolution: "720p",
      video_codec: "AVC",
    },
  );
});

Deno.test("shouldProbeMediaMetadata checks for unresolved media details", () => {
  assertEquals(
    shouldProbeMediaMetadata({
      audio_channels: "2.0",
      audio_codec: "AAC",
      resolution: "1080p",
      video_codec: "HEVC",
    }),
    false,
  );
  assertEquals(
    shouldProbeMediaMetadata({
      audio_channels: undefined,
      audio_codec: "AAC",
      resolution: "1080p",
      video_codec: "HEVC",
    }),
    true,
  );
});
