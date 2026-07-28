import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Effect, Schema } from "effect";

export class MediaProbeFailure extends Schema.TaggedErrorClass<MediaProbeFailure>()(
  "MediaProbeFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
  },
) {}

class FFProbeError extends Schema.TaggedErrorClass<FFProbeError>()("FFProbeError", {
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

export const MediaProbeCommandOutputSchema = Schema.Struct({
  stdout: Schema.String,
});

export type MediaProbeCommandOutput = Schema.Schema.Type<typeof MediaProbeCommandOutputSchema>;

export function runFfprobeCommand(
  executeString: (
    command: ChildProcess.Command,
  ) => Effect.Effect<string, unknown>,
  args: readonly string[],
  timeoutMs: number,
): Effect.Effect<MediaProbeCommandOutput, MediaProbeFailure> {
  return Effect.suspend(() => executeString(ChildProcess.make("ffprobe", [...args]))).pipe(
    Effect.map((stdout) => ({ stdout }) satisfies MediaProbeCommandOutput),
    Effect.mapError(
      (cause) =>
        new FFProbeError({
          cause,
          message: "ffprobe command failed",
        }),
    ),
    Effect.timeoutOrElse({
      duration: `${timeoutMs} millis`,
      orElse: () =>
        Effect.fail(
          new FFProbeError({
          cause: "Timeout",
          message: `ffprobe timed out after ${timeoutMs}ms`,
        }),
        ),
    }),
    Effect.catchTag("FFProbeError", (error) =>
      Effect.logWarning("ffprobe command failed").pipe(
        Effect.annotateLogs({
          args: args.join(" "),
          error: error.message,
        }),
        Effect.andThen(
          Effect.fail(new MediaProbeFailure({ cause: error.cause, message: error.message })),
        ),
      ),
    ),
  );
}

export function runFfprobeCommandWith(
  executor: ChildProcessSpawner.ChildProcessSpawner["Service"],
  args: readonly string[],
  timeoutMs: number,
) {
  return runFfprobeCommand(executor.string, args, timeoutMs);
}
