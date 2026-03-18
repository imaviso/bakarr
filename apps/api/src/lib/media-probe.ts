import { Context, Effect, Layer } from "effect";

export interface ProbedMediaMetadata {
  duration_seconds?: number;
  resolution?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
}

type MediaMetadataInput = {
  duration_seconds?: number;
  resolution?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
};

const FFPROBE_VERSION_TIMEOUT_MS = 3_000;
const FFPROBE_PROBE_TIMEOUT_MS = 10_000;

type FfprobeCommandResult =
  | { readonly ok: true; readonly output: Deno.CommandOutput }
  | { readonly ok: false; readonly reason: "aborted" | "failed" };

export interface MediaProbeShape {
  readonly probeVideoFile: (
    path: string,
  ) => Effect.Effect<ProbedMediaMetadata | undefined, never>;
}

export class MediaProbe extends Context.Tag("@bakarr/api/MediaProbe")<
  MediaProbe,
  MediaProbeShape
>() {}

export function shouldProbeMediaMetadata(input: MediaMetadataInput) {
  return !input.resolution || !input.video_codec || !input.audio_codec ||
    !input.audio_channels;
}

export function shouldProbeDetailedMediaMetadata(input: MediaMetadataInput) {
  return !input.duration_seconds || shouldProbeMediaMetadata(input);
}

export function mergeProbedMediaMetadata<T extends MediaMetadataInput>(
  input: T,
  probed?: ProbedMediaMetadata,
): T {
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

export function parseFfprobeJson(json: string) {
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
  const videoStream = streams.map(asRecord).find((stream) =>
    stream?.codec_type === "video"
  );
  const audioStream = streams.map(asRecord).find((stream) =>
    stream?.codec_type === "audio"
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
      layout: asString(audioStream?.channel_layout),
    }),
  };

  return metadata.duration_seconds || metadata.resolution ||
      metadata.video_codec ||
      metadata.audio_codec || metadata.audio_channels
    ? metadata
    : undefined;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeResolution(stream?: Record<string, unknown>) {
  const width = asNumber(stream?.width);
  const height = asNumber(stream?.height);
  const candidate = height ?? width;

  if (!candidate) {
    return undefined;
  }

  if (candidate >= 2160) return "2160p";
  if (candidate >= 1440) return "1440p";
  if (candidate >= 1080) return "1080p";
  if (candidate >= 720) return "720p";
  if (candidate >= 480) return "480p";

  return `${candidate}p`;
}

function normalizeVideoCodec(codec?: string) {
  const normalized = normalizeCodecName(codec);

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
  const normalized = normalizeCodecName(codec);

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

function normalizeCodecName(codec?: string) {
  return codec?.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeAudioChannels(input: {
  channels?: number;
  layout?: string;
}) {
  const layout = input.layout?.toLowerCase();

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

function isAbortError(cause: unknown) {
  return cause instanceof Error && cause.name === "AbortError";
}

function runFfprobeCommand(input: {
  readonly args: readonly string[];
  readonly stdout: "null" | "piped";
  readonly timeoutMs: number;
}) {
  return Effect.tryPromise({
    try: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.timeoutMs);

      try {
        const output = await new Deno.Command("ffprobe", {
          args: [...input.args],
          signal: controller.signal,
          stderr: "null",
          stdout: input.stdout,
        }).output();

        return { ok: true, output } satisfies FfprobeCommandResult;
      } finally {
        clearTimeout(timer);
      }
    },
    catch: (cause) => cause,
  }).pipe(
    Effect.catchAll((cause) =>
      Effect.succeed(
        {
          ok: false,
          reason: isAbortError(cause) ? "aborted" : "failed",
        } satisfies FfprobeCommandResult,
      )
    ),
  );
}

const makeMediaProbe = (): MediaProbeShape => {
  const decoder = new TextDecoder();
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

      const version = yield* runFfprobeCommand({
        args: ["-version"],
        stdout: "null",
        timeoutMs: FFPROBE_VERSION_TIMEOUT_MS,
      });

      availability = version.ok ? version.output.success : false;
      return availability;
    },
  );

  const probeVideoFile = Effect.fn("MediaProbe.probeVideoFile")(
    function* (path: string) {
      const available = yield* resolveAvailability();

      if (!available) {
        return undefined;
      }

      const output = yield* runFfprobeCommand({
        args: [
          "-v",
          "error",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          path,
        ],
        stdout: "piped",
        timeoutMs: FFPROBE_PROBE_TIMEOUT_MS,
      });

      if (!output.ok) {
        if (output.reason === "failed") {
          availability = false;
        }

        return undefined;
      }

      if (!output.output.success) {
        return undefined;
      }

      return parseFfprobeJson(decoder.decode(output.output.stdout));
    },
  );

  return { probeVideoFile };
};

export const MediaProbeLive = Layer.succeed(MediaProbe, makeMediaProbe());
