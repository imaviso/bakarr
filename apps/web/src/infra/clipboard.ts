import { Effect, Schema } from "effect";

export class ClipboardWriteError extends Schema.TaggedError<ClipboardWriteError>()(
  "ClipboardWriteError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
  },
) {}

export const copyToClipboard = Effect.fn("Clipboard.copyToClipboard")((text: string) =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(text),
    catch: (cause) =>
      new ClipboardWriteError({
        cause,
        message: "Failed to copy link",
      }),
  }),
);
