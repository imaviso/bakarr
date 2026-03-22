import { assertEquals } from "@std/assert";
import { CommandExecutor } from "@effect/platform";
import { Effect, Layer } from "effect";

import {
  FFPROBE_CONCURRENCY_LIMIT,
  MediaProbe,
  type MediaProbeCommandOutput,
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
  let active = 0;
  let maxActive = 0;

  const commandExecutorStub = makeCommandExecutorStub((command) => {
    if (command.args.includes("-version")) {
      return Effect.succeed("ffprobe version test");
    }

    active += 1;
    if (active > maxActive) {
      maxActive = active;
    }

    return Effect.promise(() =>
      new Promise<string>((resolve) => {
        setTimeout(() => {
          active -= 1;
          resolve(
            '{"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080}],"format":{"duration":"24"}}',
          );
        }, 25);
      })
    );
  });

  await Effect.runPromise(
    Effect.flatMap(MediaProbe, (mediaProbe) =>
      Effect.forEach(
        Array.from(
          { length: 10 },
          (_, index) => `/tmp/media-probe-${index}.mkv`,
        ),
        (path) => mediaProbe.probeVideoFile(path),
        { concurrency: "unbounded" },
      )).pipe(
        Effect.provide(
          Layer.mergeAll(
            MediaProbeLive,
            Layer.succeed(CommandExecutor.CommandExecutor, commandExecutorStub),
          ),
        ),
      ),
  );

  assertEquals(maxActive <= FFPROBE_CONCURRENCY_LIMIT, true);
});

function makeCommandExecutorStub(
  runAsString: (
    command: {
      readonly args: ReadonlyArray<string>;
      readonly command: string;
    },
  ) => Effect.Effect<string, never>,
): CommandExecutor.CommandExecutor {
  const parseOutput = (output: string): MediaProbeCommandOutput => ({
    stdout: output,
  });

  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => Effect.die("exitCode not implemented for test"),
    lines: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string })
        .pipe(
          Effect.map((value) =>
            parseOutput(value).stdout.split(/\r?\n/).filter((line) =>
              line.length > 0
            )
          ),
        ),
    start: () => Effect.die("start not implemented for test"),
    stream: () => Effect.die("stream not implemented for test") as never,
    streamLines: () =>
      Effect.die("streamLines not implemented for test") as never,
    string: (command, _encoding) =>
      runAsString(command as { args: ReadonlyArray<string>; command: string })
        .pipe(
          Effect.map((value) => parseOutput(value).stdout),
        ),
  };
}
