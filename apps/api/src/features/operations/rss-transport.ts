import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Context, Effect, Layer, Schema } from "effect";

import { MAX_RSS_BYTES } from "@/features/operations/rss-limits.ts";
import type { PinnedRequestTarget } from "@/features/operations/rss-client-ssrf.ts";
import { StreamPayloadTooLargeError } from "@/lib/bounded-stream.ts";

export interface RssTransportResponse {
  readonly body: Uint8Array;
  readonly headers: Headers;
  readonly status: number;
}

export class RssTransportError extends Schema.TaggedError<RssTransportError>()(
  "RssTransportError",
  {
    cause: Schema.Defect,
    message: Schema.String,
  },
) {}

export class RssTransportPayloadTooLargeError extends Schema.TaggedError<RssTransportPayloadTooLargeError>()(
  "RssTransportPayloadTooLargeError",
  {
    actualBytes: Schema.Number,
    maxBytes: Schema.Number,
    message: Schema.String,
  },
) {}

export interface RssTransportShape {
  readonly execute: (
    target: PinnedRequestTarget,
  ) => Effect.Effect<RssTransportResponse, RssTransportError | RssTransportPayloadTooLargeError>;
}

export class RssTransport extends Context.Tag("@bakarr/api/RssTransport")<
  RssTransport,
  RssTransportShape
>() {}

export const RssTransportLive = Layer.effect(
  RssTransport,
  Effect.sync(() => {
    const execute = Effect.fn("RssTransport.execute")(function* (target: PinnedRequestTarget) {
      return yield* Effect.tryPromise({
        try: (signal) =>
          executePinnedHttpRequest({
            signal,
            target,
          }),
        catch: (cause) =>
          cause instanceof StreamPayloadTooLargeError
            ? new RssTransportPayloadTooLargeError({
                actualBytes: cause.actualBytes,
                maxBytes: cause.maxBytes,
                message: `RSS payload exceeded maximum size of ${cause.maxBytes} bytes`,
              })
            : new RssTransportError({
                cause,
                message: "RSS transport request failed",
              }),
      });
    });

    return RssTransport.of({ execute });
  }),
);

async function executePinnedHttpRequest(input: {
  readonly signal?: AbortSignal;
  readonly target: PinnedRequestTarget;
}): Promise<RssTransportResponse> {
  const requestImpl = input.target.parsedUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const pinnedTarget = input.target._tag === "Pinned" ? input.target : undefined;

  return await new Promise<RssTransportResponse>((resolve, reject) => {
    const request = requestImpl(
      {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml",
          "User-Agent": "bakarr/1.0",
        },
        hostname: input.target.parsedUrl.hostname,
        lookup: pinnedTarget
          ? (...lookupArgs) => {
              const callback = lookupArgs[lookupArgs.length - 1];

              if (typeof callback !== "function") {
                return;
              }

              const options = lookupArgs[1];
              const shouldReturnAll =
                typeof options === "object" &&
                options !== null &&
                "all" in options &&
                options.all === true;

              if (shouldReturnAll) {
                callback(null, [
                  {
                    address: pinnedTarget.pinnedAddress,
                    family: pinnedTarget.pinnedAddressFamily,
                  },
                ]);
                return;
              }

              callback(null, pinnedTarget.pinnedAddress, pinnedTarget.pinnedAddressFamily);
            }
          : undefined,
        method: "GET",
        path: `${input.target.parsedUrl.pathname}${input.target.parsedUrl.search}`,
        port: input.target.parsedUrl.port ? Number(input.target.parsedUrl.port) : undefined,
        protocol: input.target.parsedUrl.protocol,
      },
      (response) => {
        const chunks: Uint8Array[] = [];
        let totalLength = 0;

        const failPayloadTooLarge = () => {
          request.destroy(
            new StreamPayloadTooLargeError({
              actualBytes: totalLength,
              maxBytes: MAX_RSS_BYTES,
            }),
          );
        };

        const contentLengthHeader = response.headers["content-length"];
        const contentLengthValue = Array.isArray(contentLengthHeader)
          ? contentLengthHeader[0]
          : contentLengthHeader;
        const contentLength =
          contentLengthValue === undefined ? Number.NaN : Number.parseInt(contentLengthValue, 10);

        if (Number.isFinite(contentLength) && contentLength > MAX_RSS_BYTES) {
          failPayloadTooLarge();
          return;
        }

        if (
          response.statusCode !== undefined &&
          (response.statusCode < 200 || response.statusCode >= 300)
        ) {
          resolve({
            body: new Uint8Array(0),
            headers: new Headers(
              Object.entries(normalizeNodeHeaders(response.headers)).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
            status: response.statusCode,
          });
          response.resume();
          return;
        }

        response.on("data", (chunk) => {
          const normalizedChunk = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          totalLength += normalizedChunk.length;

          if (totalLength > MAX_RSS_BYTES) {
            failPayloadTooLarge();
            return;
          }

          chunks.push(normalizedChunk);
        });
        response.on("end", () => {
          const body = new Uint8Array(totalLength);
          let offset = 0;

          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.length;
          }

          resolve({
            body,
            headers: new Headers(
              Object.entries(normalizeNodeHeaders(response.headers)).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
            status: response.statusCode ?? 500,
          });
        });
        response.on("error", reject);
      },
    );

    request.on("error", reject);
    if (input.signal) {
      const abort = () => request.destroy(new Error("RSS request aborted"));
      input.signal.addEventListener("abort", abort, { once: true });
      request.on("close", () => input.signal?.removeEventListener("abort", abort));
    }
    request.end();
  });
}

function normalizeNodeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]),
  );
}
