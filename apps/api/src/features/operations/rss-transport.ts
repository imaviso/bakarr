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

interface RssTransportRequestConfig {
  readonly headers: Record<string, string>;
  readonly hostname: string;
  readonly lookup: ((...lookupArgs: unknown[]) => void) | undefined;
  readonly method: "GET";
  readonly path: string;
  readonly port: number | undefined;
  readonly protocol: string;
  readonly servername: string | undefined;
}

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
                message: formatRssTransportFailureMessage(cause),
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
  const parsedUrl = input.target.parsedUrl;
  const requestImpl = parsedUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const requestConfig = buildRssTransportRequestConfig(input.target);

  return await new Promise<RssTransportResponse>((resolve, reject) => {
    const request = requestImpl(
      {
        headers: requestConfig.headers,
        hostname: requestConfig.hostname,
        lookup: requestConfig.lookup,
        method: requestConfig.method,
        path: requestConfig.path,
        port: requestConfig.port,
        protocol: requestConfig.protocol,
        servername: requestConfig.servername,
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

function buildRssTransportRequestConfig(target: PinnedRequestTarget): RssTransportRequestConfig {
  const parsedUrl = target.parsedUrl;
  const pinnedTarget = target._tag === "Pinned" ? target : undefined;
  const isHttps = parsedUrl.protocol === "https:";

  return {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "bakarr/1.0",
    },
    hostname: parsedUrl.hostname,
    lookup: pinnedTarget && !isHttps ? makePinnedLookup(pinnedTarget) : undefined,
    method: "GET",
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    port: parsedUrl.port ? Number(parsedUrl.port) : undefined,
    protocol: parsedUrl.protocol,
    servername: isHttps ? parsedUrl.hostname : undefined,
  };
}

function makePinnedLookup(pinnedTarget: Extract<PinnedRequestTarget, { _tag: "Pinned" }>) {
  return (...lookupArgs: unknown[]) => {
    const callback = lookupArgs[lookupArgs.length - 1];

    if (typeof callback !== "function") {
      return;
    }

    const options = lookupArgs[1];
    const shouldReturnAll =
      typeof options === "object" && options !== null && "all" in options && options.all === true;

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
  };
}

export function buildRssTransportRequestConfigForTest(target: PinnedRequestTarget) {
  return buildRssTransportRequestConfig(target);
}

function normalizeNodeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]),
  );
}

export function formatRssTransportFailureMessage(cause: unknown): string {
  if (cause instanceof Error) {
    const details = [
      cause.name,
      readErrorStringField(cause, "code"),
      readErrorStringField(cause, "syscall"),
      readErrorStringField(cause, "hostname"),
      cause.message,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");

    return details.length > 0
      ? `RSS transport request failed: ${details}`
      : "RSS transport request failed";
  }

  return "RSS transport request failed";
}

function readErrorStringField(error: Error, key: "code" | "hostname" | "syscall") {
  const extended = error as Error & {
    readonly code?: unknown;
    readonly hostname?: unknown;
    readonly syscall?: unknown;
  };

  if (!(key in extended)) {
    return undefined;
  }

  const value = extended[key];
  return typeof value === "string" ? value : undefined;
}
