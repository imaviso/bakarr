import { CommandExecutor } from "@effect/platform";
import { Context, Effect, Either, Layer, ParseResult, Schema } from "effect";

import { MediaProbeFailure, runFfprobeCommandWith } from "@/infra/media/probe-command.ts";

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

export class MediaProbeMetadataFound extends Schema.TaggedClass<MediaProbeMetadataFound>()(
  "MediaProbeMetadataFound",
  {
    metadata: ProbedMediaMetadataSchema,
  },
) {}

export class MediaProbeNoMetadata extends Schema.TaggedClass<MediaProbeNoMetadata>()(
  "MediaProbeNoMetadata",
  {},
) {}

export type MediaProbeResult = MediaProbeMetadataFound | MediaProbeNoMetadata;

export { MediaProbeFailure };

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

const VIDEO_CODEC_LABELS: Record<string, string> = {
  av1: "AV1",
  avc: "AVC",
  avc1: "AVC",
  h264: "AVC",
  h265: "HEVC",
  hevc: "HEVC",
  mpeg2video: "MPEG-2",
  vc1: "VC-1",
  vp9: "VP9",
  x264: "AVC",
  x265: "HEVC",
};

const AUDIO_CODEC_LABELS: Record<string, string> = {
  aac: "AAC",
  ac3: "AC3",
  dts: "DTS",
  dtshdma: "DTS",
  eac3: "E-AC3",
  flac: "FLAC",
  mp3: "MP3",
  opus: "Opus",
  pcm: "PCM",
  pcms16le: "PCM",
  pcms24le: "PCM",
  truehd: "TrueHD",
  vorbis: "Vorbis",
};

const AUDIO_CHANNEL_LAYOUT_LABELS: Record<string, string> = {
  "2.1": "2.1",
  "5.1": "5.1",
  "7.1": "7.1",
  mono: "1.0",
  stereo: "2.0",
};

const AUDIO_CHANNEL_COUNT_LABELS: Record<number, string> = {
  1: "1.0",
  2: "2.0",
  3: "3.0",
  4: "4.0",
  5: "5.0",
  6: "5.1",
  8: "7.1",
};

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
  if (!codec) {
    return undefined;
  }

  const normalized = codec.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return VIDEO_CODEC_LABELS[normalized] ?? codec.toUpperCase();
};

const normalizeAudioCodec = (codec?: string) => {
  if (!codec) {
    return undefined;
  }

  const normalized = codec.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return AUDIO_CODEC_LABELS[normalized] ?? codec.toUpperCase();
};

const normalizeAudioChannels = (input: { channels?: number; channel_layout?: string }) => {
  const layout = input.channel_layout?.toLowerCase();

  if (layout) {
    const layoutLabel = AUDIO_CHANNEL_LAYOUT_LABELS[layout];
    if (layoutLabel) {
      return layoutLabel;
    }
  }

  if (input.channels === undefined) {
    return undefined;
  }

  return AUDIO_CHANNEL_COUNT_LABELS[input.channels] ?? `${input.channels}.0`;
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

const ProbedMediaMetadataFromFFProbeOutputSchema = Schema.transform(
  FFProbeOutputSchema,
  Schema.NullOr(ProbedMediaMetadataSchema),
  {
    decode: (output) => {
      const { streams } = output;
      const videoStream = streams.find((s) => s.codec_type === "video");
      const audioStream = streams.find((s) => s.codec_type === "audio");
      const { format } = output;

      const metadata = {
        duration_seconds: normalizeDurationSeconds(videoStream?.duration ?? format?.duration),
        resolution: normalizeResolution(
          videoStream
            ? {
                ...(videoStream.width !== undefined ? { width: videoStream.width } : {}),
                ...(videoStream.height !== undefined ? { height: videoStream.height } : {}),
              }
            : undefined,
        ),
        video_codec: normalizeVideoCodec(videoStream?.codec_name),
        audio_codec: normalizeAudioCodec(audioStream?.codec_name),
        audio_channels: normalizeAudioChannels({
          ...(audioStream?.channels !== undefined ? { channels: audioStream.channels } : {}),
          ...(audioStream?.channel_layout !== undefined
            ? { channel_layout: audioStream.channel_layout }
            : {}),
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
  readonly probeVideoFile: (path: string) => Effect.Effect<MediaProbeResult, MediaProbeFailure>;
}

export class MediaProbe extends Context.Tag("@bakarr/api/MediaProbe")<
  MediaProbe,
  MediaProbeShape
>() {}

export function shouldProbeMediaMetadata(input: {
  duration_seconds?: number | undefined;
  resolution?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
}) {
  return !input.resolution || !input.video_codec || !input.audio_codec || !input.audio_channels;
}

export function shouldProbeDetailedMediaMetadata(input: {
  duration_seconds?: number | undefined;
  resolution?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
}) {
  return !input.duration_seconds || shouldProbeMediaMetadata(input);
}

export function mergeProbedMediaMetadata<
  T extends {
    duration_seconds?: number | undefined;
    resolution?: string | undefined;
    video_codec?: string | undefined;
    audio_codec?: string | undefined;
    audio_channels?: string | undefined;
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

export const probeMediaMetadataOrUndefined = Effect.fn("MediaProbe.probeMediaMetadataOrUndefined")(
  function* (mediaProbe: MediaProbeShape, path: string) {
    const probeResult = yield* Effect.either(mediaProbe.probeVideoFile(path));

    if (Either.isLeft(probeResult)) {
      return undefined;
    }

    return probeResult.right._tag === "MediaProbeMetadataFound"
      ? probeResult.right.metadata
      : undefined;
  },
);

export const parseFfprobeJson = Effect.fn("MediaProbe.parseFfprobeJson")(
  (json: string): Effect.Effect<MediaProbeResult, MediaProbeFailure> =>
    decodeFfprobeOutput(json).pipe(Effect.flatMap(normalizeFfprobeDecodedOutput)),
);

function decodeFfprobeOutput(
  input: unknown,
): Effect.Effect<Schema.Schema.Type<typeof FFProbeOutputSchema>, MediaProbeFailure> {
  return Schema.decodeUnknown(FFProbeOutputJsonSchema)(input).pipe(
    Effect.mapError(
      (cause) =>
        new MediaProbeFailure({
          cause,
          message: "ffprobe output was invalid",
        }),
    ),
  );
}

function normalizeFfprobeDecodedOutput(
  output: Schema.Schema.Type<typeof FFProbeOutputSchema>,
): Effect.Effect<MediaProbeMetadataFound | MediaProbeNoMetadata, MediaProbeFailure> {
  return Schema.decodeUnknown(ProbedMediaMetadataFromFFProbeOutputSchema)(output).pipe(
    Effect.map((metadata) =>
      metadata ? new MediaProbeMetadataFound({ metadata }) : new MediaProbeNoMetadata({}),
    ),
    Effect.mapError(
      (cause) =>
        new MediaProbeFailure({
          cause,
          message: "ffprobe metadata normalization failed",
        }),
    ),
  );
}

export {
  MediaProbeCommandOutputSchema,
  type MediaProbeCommandOutput,
} from "@/infra/media/probe-command.ts";

function logProbeFailure(path: string, failure: MediaProbeFailure): Effect.Effect<void> {
  const parseError = ParseResult.isParseError(failure.cause)
    ? ParseResult.TreeFormatter.formatErrorSync(failure.cause)
    : undefined;

  return yieldLog(path, failure.message, parseError);
}

function yieldLog(
  path: string,
  message: string,
  parseError: string | undefined,
): Effect.Effect<void> {
  return Effect.logWarning(message).pipe(
    Effect.annotateLogs(parseError ? { path, parse_error: parseError } : { path }),
  );
}

const makeMediaProbe = (
  ffprobeSemaphore: Effect.Semaphore,
  executor: CommandExecutor.CommandExecutor,
): MediaProbeShape => {
  const probeVideoFile = Effect.fn("MediaProbe.probeVideoFile")(function* (path: string) {
    const output = yield* ffprobeSemaphore.withPermits(1)(
      runFfprobeCommandWith(
        executor,
        ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        FFPROBE_PROBE_TIMEOUT_MS,
      ),
    );
    const stdout = output.stdout;

    return yield* decodeFfprobeOutput(stdout).pipe(
      Effect.flatMap(normalizeFfprobeDecodedOutput),
      Effect.tapError((failure) => logProbeFailure(path, failure)),
    );
  });

  return { probeVideoFile };
};

export const MediaProbeLive = Layer.effect(
  MediaProbe,
  Effect.gen(function* () {
    const ffprobeSemaphore = yield* Effect.makeSemaphore(FFPROBE_CONCURRENCY_LIMIT);
    const executor = yield* CommandExecutor.CommandExecutor;

    const availability = yield* runFfprobeCommandWith(
      executor,
      ["-version"],
      FFPROBE_VERSION_TIMEOUT_MS,
    ).pipe(Effect.either);

    if (Either.isLeft(availability)) {
      yield* Effect.logWarning("ffprobe unavailable").pipe(
        Effect.annotateLogs({ message: availability.left.message }),
      );
      return yield* Effect.die(availability.left.cause ?? new Error(availability.left.message));
    }

    return makeMediaProbe(ffprobeSemaphore, executor);
  }),
);
