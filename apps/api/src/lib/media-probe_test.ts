import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";

import {
  FFPROBE_CONCURRENCY_LIMIT,
  MediaProbe,
  MediaProbeLive,
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

Deno.test("FFPROBE_CONCURRENCY_LIMIT is defined and reasonable", () => {
  assertEquals(FFPROBE_CONCURRENCY_LIMIT > 0, true);
  assertEquals(FFPROBE_CONCURRENCY_LIMIT <= 4, true);
});

Deno.test("MediaProbe enforces global ffprobe concurrency limit", async () => {
  const originalCommand = Deno.Command;
  const originalPermissionQuery = Deno.permissions.query;
  let active = 0;
  let maxActive = 0;

  class CommandStub {
    readonly #args: readonly string[];

    constructor(
      _command: string,
      options: { readonly args?: readonly string[] },
    ) {
      this.#args = options.args ?? [];
    }

    output() {
      if (this.#args.includes("-version")) {
        return Promise.resolve(
          {
            code: 0,
            signal: null,
            stderr: new Uint8Array(0),
            stdout: new TextEncoder().encode("ffprobe version test"),
            success: true,
          } satisfies Deno.CommandOutput,
        );
      }

      active += 1;
      if (active > maxActive) {
        maxActive = active;
      }

      return new Promise<Deno.CommandOutput>((resolve) => {
        setTimeout(() => {
          active -= 1;

          resolve({
            code: 0,
            signal: null,
            stderr: new Uint8Array(0),
            stdout: new TextEncoder().encode(
              '{"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080}],"format":{"duration":"24"}}',
            ),
            success: true,
          });
        }, 25);
      });
    }
  }

  try {
    Deno.permissions.query = (() =>
      Promise.resolve({
        name: "run",
        state: "granted",
      } as unknown as Deno.PermissionStatus)) as typeof Deno.permissions.query;
    Deno.Command = CommandStub as unknown as typeof Deno.Command;

    await Effect.runPromise(
      Effect.flatMap(MediaProbe, (mediaProbe) =>
        Effect.forEach(
          Array.from({ length: 10 }, (_, index) =>
            `/tmp/media-probe-${index}.mkv`),
          (path) =>
            mediaProbe.probeVideoFile(path),
          { concurrency: "unbounded" },
        )).pipe(Effect.provide(Layer.mergeAll(MediaProbeLive))),
    );

    assertEquals(maxActive <= FFPROBE_CONCURRENCY_LIMIT, true);
  } finally {
    Deno.Command = originalCommand;
    Deno.permissions.query = originalPermissionQuery;
  }
});
