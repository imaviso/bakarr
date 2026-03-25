import { Command, CommandExecutor } from "@effect/platform";
import { Context, Effect, Layer, Option, Schema } from "effect";

const FFPROBE_VERSION_TIMEOUT_MS = 3_000;
const FFPROBE_PROBE_TIMEOUT_MS = 10_000;

export const FFPROBE_CONCURRENCY_LIMIT = 2;

export const ProbedMediaMetadataSchema = Schema.Struct({
  audio_channels: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  duration_seconds: Schema.optional(Schema.Number),
  resolution: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
});

export type ProbedMediaMetadata = Schema.Schema.Type<typeof ProbedMediaMetadataSchema>;

class FFProbeError extends Schema.TaggedError<FFProbeError>()("FFProbeError", {
  cause: Schema.Defect,
  message: Schema.String,
}) {}

class FFProbeStreamSchema extends Schema.Class<FFProbeStreamSchema>("FFProbeStreamSchema")({
  codec_type: Schema.String,
  codec_name: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  channels: Schema.optional(Schema.Number),
  channel_layout: Schema.optional(Schema.String),
}) {}

class FFProbeFormatSchema extends Schema.Class<FFProbeFormatSchema>("FFProbeFormatSchema")({
  duration: Schema.optional(Schema.String),
}) {}

class FFProbeOutputSchema extends Schema.Class<FFProbeOutputSchema>("FFProbeOutputSchema")({
  streams: Schema.Array(FFProbeStreamSchema),
  format: Schema.optional(FFProbeFormatSchema),
}) {}
const FFProbeOutputJsonSchema = Schema.parseJson(FFProbeOutputSchema);

const ProbedMediaMetadataFromFFProbeOutputSchema = Schema.transform(
  FFProbeOutputSchema,
  Schema.NullOr(ProbedMediaMetadataSchema),
  {
    decode: (output) => {
      const normalizeResolution = (stream?: { width?: number; height?: number }) => {
        const height = stream?.height ?? stream?.width;

        if (!height) {
          return undefined;
        }

        if (height >= 2160) return "2160p";
        if (height >= 1440) return "1440p";
        if (height >= 1080) return "1080p";
        if (height >= 720) return "720p";
        if (height >= 480) return "480p";

        return `${height}p`;
      };

      const normalizeVideoCodec = (codec?: string) => {
        const normalized = codec?.toLowerCase().replace(/[^a-z0-9]+/g, "");

        switch (normalized) {
          case "h264":
          case "avc":
          case "avc1":
          case "x264":
            return "AVC";
          case "h265":
          case "hevc":
          case "x265":
            return "HEVC";
          case "av1":
            return "AV1";
          case "vp9":
            return "VP9";
          case "mpeg2video":
            return "MPEG-2";
          case "vc1":
            return "VC-1";
          default:
            return codec?.toUpperCase();
        }
      };

      const normalizeAudioCodec = (codec?: string) => {
        const normalized = codec?.toLowerCase().replace(/[^a-z0-9]+/g, "");

        switch (normalized) {
          case "aac":
            return "AAC";
          case "ac3":
            return "AC3";
          case "eac3":
            return "E-AC3";
          case "flac":
            return "FLAC";
          case "mp3":
            return "MP3";
          case "opus":
            return "Opus";
          case "vorbis":
            return "Vorbis";
          case "truehd":
            return "TrueHD";
          case "dts":
          case "dtshdma":
            return "DTS";
          case "pcm":
          case "pcms16le":
          case "pcms24le":
            return "PCM";
          default:
            return codec?.toUpperCase();
        }
      };

      const normalizeAudioChannels = (input: { channels?: number; channel_layout?: string }) => {
        const layout = input.channel_layout?.toLowerCase();

        if (layout === "mono") return "1.0";
        if (layout === "stereo") return "2.0";
        if (layout === "2.1") return "2.1";
        if (layout === "5.1") return "5.1";
        if (layout === "7.1") return "7.1";

        switch (input.channels) {
          case 1:
            return "1.0";
          case 2:
            return "2.0";
          case 3:
            return "3.0";
          case 4:
            return "4.0";
          case 5:
            return "5.0";
          case 6:
            return "5.1";
          case 8:
            return "7.1";
          default:
            return input.channels ? `${input.channels}.0` : undefined;
        }
      };

      const normalizeDurationSeconds = (value?: string) => {
        if (!value) {
          return undefined;
        }

        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return undefined;
        }

        return Math.round(parsed);
      };

      const streams = output.streams;
      const videoStream = streams.find((s) => s.codec_type === "video");
      const audioStream = streams.find((s) => s.codec_type === "audio");
      const format = output.format;

      const metadata = {
        duration_seconds: normalizeDurationSeconds(videoStream?.duration ?? format?.duration),
        resolution: normalizeResolution(videoStream),
        video_codec: normalizeVideoCodec(videoStream?.codec_name),
        audio_codec: normalizeAudioCodec(audioStream?.codec_name),
        audio_channels: normalizeAudioChannels({
          channels: audioStream?.channels,
          channel_layout: audioStream?.channel_layout,
        }),
      } satisfies ProbedMediaMetadata;

      return metadata.duration_seconds ||
        metadata.resolution ||
        metadata.video_codec ||
        metadata.audio_codec ||
        metadata.audio_channels
        ? metadata
        : null;
    },
    encode: (metadata) =>
      metadata === null
        ? { streams: [] }
        : {
            format: metadata.duration_seconds
              ? { duration: String(metadata.duration_seconds) }
              : undefined,
            streams: [
              {
                channel_layout: metadata.audio_channels,
                channels: undefined,
                codec_name: metadata.audio_codec,
                codec_type: "audio",
                duration: metadata.duration_seconds ? String(metadata.duration_seconds) : undefined,
                height: undefined,
                width: undefined,
              },
              {
                channel_layout: undefined,
                channels: undefined,
                codec_name: metadata.video_codec,
                codec_type: "video",
                duration: metadata.duration_seconds ? String(metadata.duration_seconds) : undefined,
                height: metadata.resolution ? Number.parseInt(metadata.resolution, 10) : undefined,
                width: undefined,
              },
            ],
          },
  },
);

export interface MediaProbeShape {
  readonly probeVideoFile: (path: string) => Effect.Effect<ProbedMediaMetadata | undefined, never>;
}

export class MediaProbe extends Context.Tag("@bakarr/api/MediaProbe")<
  MediaProbe,
  MediaProbeShape
>() {}

export function shouldProbeMediaMetadata(input: {
  duration_seconds?: number;
  resolution?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
}) {
  return !input.resolution || !input.video_codec || !input.audio_codec || !input.audio_channels;
}

export function shouldProbeDetailedMediaMetadata(input: {
  duration_seconds?: number;
  resolution?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
}) {
  return !input.duration_seconds || shouldProbeMediaMetadata(input);
}

export function mergeProbedMediaMetadata<
  T extends {
    duration_seconds?: number;
    resolution?: string;
    video_codec?: string;
    audio_codec?: string;
    audio_channels?: string;
  },
>(input: T, probed?: ProbedMediaMetadata): T {
  if (!probed) {
    return input;
  }

  return {
    ...input,
    duration_seconds: input.duration_seconds ?? probed.duration_seconds,
    resolution: input.resolution ?? probed.resolution,
    video_codec: input.video_codec ?? probed.video_codec,
    audio_codec: input.audio_codec ?? probed.audio_codec,
    audio_channels: input.audio_channels ?? probed.audio_channels,
  };
}

export function parseFfprobeJson(json: string): ProbedMediaMetadata | undefined {
  const decoded = Schema.decodeUnknownEither(FFProbeOutputJsonSchema)(json);
  return decoded._tag === "Left"
    ? undefined
    : (Schema.decodeSync(ProbedMediaMetadataFromFFProbeOutputSchema)(decoded.right) ?? undefined);
}

export const MediaProbeCommandOutputSchema = Schema.Struct({
  stdout: Schema.String,
});

export type MediaProbeCommandOutput = Schema.Schema.Type<typeof MediaProbeCommandOutputSchema>;

function runFfprobeCommand(
  args: readonly string[],
  timeoutMs: number,
): Effect.Effect<MediaProbeCommandOutput | null, never, CommandExecutor.CommandExecutor> {
  return Command.make("ffprobe", ...args).pipe(
    Command.string,
    Effect.map((stdout) => ({ stdout }) satisfies MediaProbeCommandOutput),
    Effect.mapError(
      (cause) =>
        new FFProbeError({
          cause,
          message: "ffprobe command failed",
        }),
    ),
    Effect.timeout(timeoutMs),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(
        new FFProbeError({
          cause: "Timeout",
          message: `ffprobe timed out after ${timeoutMs}ms`,
        }),
      ),
    ),
    Effect.tapError((error) =>
      Effect.logWarning("ffprobe command failed").pipe(
        Effect.annotateLogs({
          args: args.join(" "),
          error: error.message,
        }),
      ),
    ),
    Effect.catchTag("FFProbeError", () => Effect.succeed(null)),
  );
}

const makeMediaProbe = (ffprobeSemaphore: Effect.Semaphore): MediaProbeShape => {
  let availability: boolean | undefined;
  let executor: CommandExecutor.CommandExecutor | undefined;

  const resolveAvailability = Effect.fn("MediaProbe.resolveAvailability")(function* () {
    if (availability !== undefined) {
      return availability;
    }

    if (!executor) {
      const executorOption = yield* Effect.serviceOption(CommandExecutor.CommandExecutor);

      if (Option.isNone(executorOption)) {
        availability = false;
        return availability;
      }

      executor = executorOption.value;
    }

    if (!executor) {
      availability = false;
      return availability;
    }

    const output = yield* runFfprobeCommand(["-version"], FFPROBE_VERSION_TIMEOUT_MS).pipe(
      Effect.provideService(CommandExecutor.CommandExecutor, executor),
    );

    if (!output) {
      availability = false;
      return availability;
    }

    availability = true;
    return availability;
  });

  const probeVideoFile = Effect.fn("MediaProbe.probeVideoFile")(function* (path: string) {
    const available = yield* resolveAvailability();

    if (!available || !executor) {
      return undefined;
    }

    // Use semaphore to enforce global ffprobe concurrency limit
    const output = yield* ffprobeSemaphore
      .withPermits(1)(
        runFfprobeCommand(
          ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
          FFPROBE_PROBE_TIMEOUT_MS,
        ),
      )
      .pipe(Effect.provideService(CommandExecutor.CommandExecutor, executor));

    if (!output) {
      return undefined;
    }

    const decoded = yield* Effect.either(
      Schema.decodeUnknown(FFProbeOutputJsonSchema)(output.stdout),
    );

    if (decoded._tag === "Left") {
      return undefined;
    }

    const normalized = yield* Effect.either(
      Schema.decodeUnknown(ProbedMediaMetadataFromFFProbeOutputSchema)(decoded.right),
    );

    return normalized._tag === "Left" ? undefined : (normalized.right ?? undefined);
  });

  return { probeVideoFile };
};

export const MediaProbeLive = Layer.effect(
  MediaProbe,
  Effect.map(Effect.makeSemaphore(FFPROBE_CONCURRENCY_LIMIT), makeMediaProbe),
);
