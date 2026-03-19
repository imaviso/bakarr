import { Context, Effect, Layer, Schema } from "effect";

const FFPROBE_VERSION_TIMEOUT_MS = 3_000;
const FFPROBE_PROBE_TIMEOUT_MS = 10_000;

export interface ProbedMediaMetadata {
  readonly duration_seconds?: number;
  readonly resolution?: string;
  readonly video_codec?: string;
  readonly audio_codec?: string;
  readonly audio_channels?: string;
}

class FFProbeError extends Schema.TaggedError<FFProbeError>()(
  "FFProbeError",
  { cause: Schema.Defect, message: Schema.String },
) {}

const FFProbeStreamSchema = Schema.Struct({
  codec_type: Schema.String,
  codec_name: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  channels: Schema.optional(Schema.Number),
  channel_layout: Schema.optional(Schema.String),
});

const FFProbeFormatSchema = Schema.Struct({
  duration: Schema.optional(Schema.String),
});

const FFProbeOutputSchema = Schema.Struct({
  streams: Schema.Array(FFProbeStreamSchema),
  format: Schema.optional(FFProbeFormatSchema),
});

type FFProbeOutput = Schema.Schema.Type<typeof FFProbeOutputSchema>;

export interface MediaProbeShape {
  readonly probeVideoFile: (
    path: string,
  ) => Effect.Effect<ProbedMediaMetadata | undefined, never>;
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
  return !input.resolution || !input.video_codec || !input.audio_codec ||
    !input.audio_channels;
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

function normalizeResolution(stream?: {
  width?: number;
  height?: number;
}) {
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
}

function normalizeVideoCodec(codec?: string) {
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
}

function normalizeAudioCodec(codec?: string) {
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
}

function normalizeAudioChannels(input: {
  channels?: number;
  channel_layout?: string;
}) {
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
}

function normalizeDurationSeconds(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed);
}

export function parseFfprobeJson(
  json: string,
): ProbedMediaMetadata | undefined {
  try {
    return parseFfprobePayload(JSON.parse(json));
  } catch {
    return undefined;
  }
}

export function parseFfprobePayload(
  payload: unknown,
): ProbedMediaMetadata | undefined {
  const root = asRecord(payload);
  const streams = Array.isArray(root?.streams) ? root.streams : [];
  const videoStream = streams.map(asRecord).find((s) =>
    s?.codec_type === "video"
  );
  const audioStream = streams.map(asRecord).find((s) =>
    s?.codec_type === "audio"
  );
  const format = asRecord(root?.format);

  const metadata: ProbedMediaMetadata = {
    duration_seconds: normalizeDurationSeconds(
      asString(videoStream?.duration) ?? asString(format?.duration),
    ),
    resolution: normalizeResolution(videoStream),
    video_codec: normalizeVideoCodec(asString(videoStream?.codec_name)),
    audio_codec: normalizeAudioCodec(asString(audioStream?.codec_name)),
    audio_channels: normalizeAudioChannels({
      channels: asNumber(audioStream?.channels),
      channel_layout: asString(audioStream?.channel_layout),
    }),
  };

  return metadata.duration_seconds || metadata.resolution ||
      metadata.video_codec ||
      metadata.audio_codec || metadata.audio_channels
    ? metadata
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseFFProbeOutput(
  output: FFProbeOutput,
): ProbedMediaMetadata | undefined {
  const streams = output.streams;
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");
  const format = output.format;

  const metadata: ProbedMediaMetadata = {
    duration_seconds: normalizeDurationSeconds(
      videoStream?.duration ?? format?.duration,
    ),
    resolution: normalizeResolution(videoStream),
    video_codec: normalizeVideoCodec(videoStream?.codec_name),
    audio_codec: normalizeAudioCodec(audioStream?.codec_name),
    audio_channels: normalizeAudioChannels({
      channels: audioStream?.channels,
      channel_layout: audioStream?.channel_layout,
    }),
  };

  return metadata.duration_seconds || metadata.resolution ||
      metadata.video_codec ||
      metadata.audio_codec || metadata.audio_channels
    ? metadata
    : undefined;
}

function runFfprobeCommand(
  args: readonly string[],
  timeoutMs: number,
): Effect.Effect<Deno.CommandOutput | null, never> {
  return Effect.sync(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return { controller, timer };
  }).pipe(
    Effect.flatMap(({ controller, timer }) =>
      Effect.tryPromise({
        try: () =>
          new Deno.Command("ffprobe", {
            args: [...args],
            signal: controller.signal,
            stderr: "null",
            stdout: "piped",
          }).output(),
        catch: (cause) =>
          new FFProbeError({
            cause,
            message: "ffprobe command failed",
          }),
      }).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("ffprobe command failed").pipe(
            Effect.annotateLogs({
              args: args.join(" "),
              error: error.message,
            }),
          )
        ),
        Effect.catchAll(() => Effect.succeed(null)),
        Effect.ensuring(Effect.sync(() => clearTimeout(timer))),
      )
    ),
  );
}

const makeMediaProbe = (): MediaProbeShape => {
  let availability: boolean | undefined;

  const resolveAvailability = Effect.fn("MediaProbe.resolveAvailability")(
    function* () {
      if (availability !== undefined) {
        return availability;
      }

      const permission = yield* Effect.promise(() =>
        Deno.permissions.query({ name: "run", command: "ffprobe" })
      );

      if (permission.state !== "granted") {
        availability = false;
        return availability;
      }

      const output = yield* runFfprobeCommand(
        ["-version"],
        FFPROBE_VERSION_TIMEOUT_MS,
      );

      if (!output) {
        availability = false;
        return availability;
      }

      availability = output.success;
      return availability;
    },
  );

  const probeVideoFile = Effect.fn("MediaProbe.probeVideoFile")(
    function* (path: string) {
      const available = yield* resolveAvailability();

      if (!available) {
        return undefined;
      }

      const output = yield* runFfprobeCommand(
        [
          "-v",
          "error",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          path,
        ],
        FFPROBE_PROBE_TIMEOUT_MS,
      );

      if (!output || !output.success) {
        return undefined;
      }

      const decoder = new TextDecoder();
      const jsonText = decoder.decode(output.stdout);

      const parsed = yield* Effect.try({
        try: () => JSON.parse(jsonText) as unknown,
        catch: () => undefined,
      }).pipe(Effect.orElse(() => Effect.void));

      if (!parsed) {
        return undefined;
      }

      const decoded = yield* Effect.either(
        Schema.decodeUnknown(FFProbeOutputSchema)(parsed),
      );

      if (decoded._tag === "Left") {
        return undefined;
      }

      return parseFFProbeOutput(decoded.right);
    },
  );

  return { probeVideoFile };
};

export const MediaProbeLive = Layer.succeed(MediaProbe, makeMediaProbe());
