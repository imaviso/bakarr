import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Context, Effect, Layer, Schema } from "effect";

import type { PinnedRequestTarget } from "@/features/operations/rss-client-ssrf.ts";

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

export interface RssTransportShape {
  readonly execute: (
    target: PinnedRequestTarget,
  ) => Effect.Effect<RssTransportResponse, RssTransportError>;
}

export class RssTransport extends Context.Tag("@bakarr/api/RssTransport")<
  RssTransport,
  RssTransportShape
>() {}

export const RssTransportLive = Layer.effect(
  RssTransport,
  Effect.gen(function* () {
    const execute = Effect.fn("RssTransport.execute")(function* (target: PinnedRequestTarget) {
      return yield* Effect.tryPromise({
        try: (signal) =>
          executePinnedHttpRequest({
            pinnedAddress: target.pinnedAddress,
            pinnedAddressFamily: target.pinnedAddressFamily,
            signal,
            url: target.parsedUrl,
          }),
        catch: (cause) =>
          new RssTransportError({
            cause,
            message: "RSS transport request failed",
          }),
      });
    });

    return RssTransport.of({ execute });
  }),
);

async function executePinnedHttpRequest(input: {
  readonly pinnedAddress?: string;
  readonly pinnedAddressFamily?: 4 | 6;
  readonly signal?: AbortSignal;
  readonly url: URL;
}): Promise<RssTransportResponse> {
  const requestImpl = input.url.protocol === "https:" ? httpsRequest : httpRequest;

  return await new Promise<RssTransportResponse>((resolve, reject) => {
    const request = requestImpl(
      {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml",
          "User-Agent": "bakarr/1.0",
        },
        hostname: input.url.hostname,
        lookup: input.pinnedAddress
          ? (_hostname, _options, callback) =>
              callback(null, input.pinnedAddress!, input.pinnedAddressFamily!)
          : undefined,
        method: "GET",
        path: `${input.url.pathname}${input.url.search}`,
        port: input.url.port ? Number(input.url.port) : undefined,
        protocol: input.url.protocol,
      },
      (response) => {
        const chunks: Uint8Array[] = [];

        response.on("data", (chunk) => {
          chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        });
        response.on("end", () => {
          resolve({
            body: Uint8Array.from(chunks.flatMap((chunk) => Array.from(chunk))),
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
