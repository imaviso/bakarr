import { assert, it } from "@effect/vitest";
import { CommandExecutor } from "@effect/platform";
import * as PlatformError from "@effect/platform/Error";
import { Cause, Effect, Exit, Layer, Logger } from "effect";

import {
  FFPROBE_CONCURRENCY_LIMIT,
  MediaProbe,
  MediaProbeLive,
  mergeProbedMediaMetadata,
  parseFfprobeJson,
  shouldProbeMediaMetadata,
} from "@/lib/media-probe.ts";
import { commandArgs, makeCommandExecutorStub } from "@/test/stubs.ts";

it("parseFfprobeJson extracts canonical media metadata", () => {
  const result = Effect.runSync(
    parseFfprobeJson(
      JSON.stringify({
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
      }),
    ),
  );

  assert.deepStrictEqual(result._tag, "MediaProbeMetadataFound");
  if (result._tag === "MediaProbeMetadataFound") {
    assert.deepStrictEqual(result.metadata, {
      audio_channels: "2.0",
      audio_codec: "AAC",
      duration_seconds: 1440,
      resolution: "1080p",
      video_codec: "HEVC",
    });
  }
});

it("parseFfprobeJson returns typed failure for invalid output", () => {
  const exit = Effect.runSyncExit(parseFfprobeJson('{"streams":"bad"}'));

  assert.deepStrictEqual(Exit.isFailure(exit), true);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    assert.deepStrictEqual(failure._tag, "Some");
    if (failure._tag === "Some") {
      assert.deepStrictEqual(failure.value._tag, "MediaProbeFailure");
    }
  }
});

it("mergeProbedMediaMetadata fills only missing fields", () => {
  assert.deepStrictEqual(
    mergeProbedMediaMetadata<{
      audio_channels?: string;
      audio_codec?: string;
      duration_seconds?: number;
      resolution?: string;
      video_codec?: string;
    }>(
      {
        resolution: "720p",
        video_codec: "AVC",
      },
      {
        audio_channels: "2.0",
        audio_codec: "AAC",
        duration_seconds: 1440,
        resolution: "1080p",
        video_codec: "HEVC",
      },
    ),
    {
      audio_channels: "2.0",
      audio_codec: "AAC",
      duration_seconds: 1440,
      resolution: "720p",
      video_codec: "AVC",
    },
  );
});

it("shouldProbeMediaMetadata checks for unresolved media details", () => {
  assert.deepStrictEqual(
    shouldProbeMediaMetadata({
      audio_channels: "2.0",
      audio_codec: "AAC",
      resolution: "1080p",
      video_codec: "HEVC",
    }),
    false,
  );
  assert.deepStrictEqual(
    shouldProbeMediaMetadata({
      audio_channels: undefined,
      audio_codec: "AAC",
      resolution: "1080p",
      video_codec: "HEVC",
    }),
    true,
  );
});

it("FFPROBE_CONCURRENCY_LIMIT is defined and reasonable", () => {
  assert.deepStrictEqual(FFPROBE_CONCURRENCY_LIMIT > 0, true);
  assert.deepStrictEqual(FFPROBE_CONCURRENCY_LIMIT <= 4, true);
});

it.effect("MediaProbe enforces global ffprobe concurrency limit", () =>
  Effect.gen(function* () {
    let active = 0;
    let maxActive = 0;

    const commandExecutorStub = makeCommandExecutorStub((command) => {
      if (commandArgs(command).includes("-version")) {
        return Effect.succeed("ffprobe version test");
      }

      active += 1;
      if (active > maxActive) {
        maxActive = active;
      }

      return Effect.promise(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              active -= 1;
              resolve(
                '{"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080}],"format":{"duration":"24"}}',
              );
            }, 25);
          }),
      );
    });

    yield* Effect.flatMap(MediaProbe, (mediaProbe) =>
      Effect.forEach(
        Array.from({ length: 10 }, (_, index) => `/tmp/media-probe-${index}.mkv`),
        (path) => mediaProbe.probeVideoFile(path),
        { concurrency: "unbounded" },
      ),
    ).pipe(
      Effect.provide(
        MediaProbeLive.pipe(
          Layer.provide(Layer.succeed(CommandExecutor.CommandExecutor, commandExecutorStub)),
        ),
      ),
    );

    assert.deepStrictEqual(maxActive <= FFPROBE_CONCURRENCY_LIMIT, true);
  }),
);

it.effect("MediaProbe fails startup when ffprobe version check fails", () =>
  Effect.gen(function* () {
    const commandExecutorStub = makeCommandExecutorStub((command) =>
      commandArgs(command).includes("-version")
        ? Effect.fail(
            new PlatformError.SystemError({
              cause: new Error("ffprobe not installed"),
              description: "ffprobe not installed",
              method: "string",
              module: "Command",
              reason: "Unknown",
            }),
          )
        : Effect.succeed('{"streams":[]}'),
    );

    const exit = yield* Effect.exit(
      Effect.flatMap(MediaProbe, (mediaProbe) =>
        mediaProbe.probeVideoFile("/tmp/missing.mkv"),
      ).pipe(
        Effect.provide(
          MediaProbeLive.pipe(
            Layer.provide(Layer.succeed(CommandExecutor.CommandExecutor, commandExecutorStub)),
          ),
        ),
      ),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.deepStrictEqual(Cause.pretty(exit.cause).includes("ffprobe not installed"), true);
    }
  }),
);

it.effect("MediaProbe returns a typed failure when ffprobe output is invalid", () =>
  Effect.gen(function* () {
    const messages: string[] = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      messages.push(String(message));
    });
    const loggerLayer = Logger.replace(Logger.defaultLogger, logger);

    const result = yield* Effect.either(
      Effect.flatMap(MediaProbe, (mediaProbe) =>
        mediaProbe.probeVideoFile("/tmp/invalid.mkv"),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            loggerLayer,
            MediaProbeLive.pipe(
              Layer.provide(
                Layer.succeed(
                  CommandExecutor.CommandExecutor,
                  makeCommandExecutorStub((command) =>
                    commandArgs(command).includes("-version")
                      ? Effect.succeed("ffprobe version test")
                      : Effect.succeed('{"streams":"bad"}'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    assert.deepStrictEqual(result._tag, "Left");
    if (result._tag === "Left") {
      assert.deepStrictEqual(result.left._tag, "MediaProbeFailure");
    }
    assert.deepStrictEqual(
      messages.some((message) => message.includes("ffprobe output was invalid")),
      true,
    );
  }),
);
