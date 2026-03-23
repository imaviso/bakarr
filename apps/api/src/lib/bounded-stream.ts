import { Effect, Schema, Stream } from "effect";

export class StreamPayloadTooLargeError
  extends Schema.TaggedError<StreamPayloadTooLargeError>()(
    "StreamPayloadTooLargeError",
    { actualBytes: Schema.Number, maxBytes: Schema.Number },
  ) {}

/**
 * Collect a binary stream into a single `Uint8Array`, failing with
 * `StreamPayloadTooLargeError` if the accumulated bytes exceed `maxBytes`.
 */
export const collectBoundedBytes = (
  stream: Stream.Stream<Uint8Array, unknown>,
  maxBytes: number,
): Effect.Effect<Uint8Array, StreamPayloadTooLargeError> => {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  return stream.pipe(
    Stream.mapError(() =>
      new StreamPayloadTooLargeError({
        actualBytes: totalBytes,
        maxBytes,
      })
    ),
    Stream.runForEach((chunk) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        return Effect.fail(
          new StreamPayloadTooLargeError({
            actualBytes: totalBytes,
            maxBytes,
          }),
        );
      }
      chunks.push(chunk);
      return Effect.void;
    }),
    Effect.map(() => {
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    }),
  );
};

/**
 * Collect a binary stream into a decoded text string, failing with
 * `StreamPayloadTooLargeError` if the accumulated bytes exceed `maxBytes`.
 */
export const collectBoundedText = (
  stream: Stream.Stream<Uint8Array, unknown>,
  maxBytes: number,
): Effect.Effect<string, StreamPayloadTooLargeError> => {
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  return stream.pipe(
    Stream.mapError(() =>
      new StreamPayloadTooLargeError({
        actualBytes: totalBytes,
        maxBytes,
      })
    ),
    Stream.runForEach((chunk) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        return Effect.fail(
          new StreamPayloadTooLargeError({
            actualBytes: totalBytes,
            maxBytes,
          }),
        );
      }
      text += decoder.decode(chunk, { stream: true });
      return Effect.void;
    }),
    Effect.map(() => text),
  );
};
