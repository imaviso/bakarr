// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Deferred, Effect, Exit, Fiber } from "effect";
import type * as Net from "node:net";
import * as NetSocket from "@effect/platform-node/NodeSocket";

import { TorrentClientUnavailableError } from "@/features/operations/torrent/torrent-domain.ts";

/**
 * SCGI wire protocol: one netstring containing NUL-terminated header pairs,
 * followed by a `,` terminator and the raw body.
 *
 * `<len>:CONTENT_LENGTH\x00<len>\x00SCGI\x001\x00,<body>`
 */
export function encodeScgiRequest(headers: Record<string, string>, body: string): Uint8Array {
  const headerParts: Array<Buffer> = [];
  for (const [key, value] of Object.entries(headers)) {
    headerParts.push(Buffer.from(`${key}\0${value}\0`, "utf8"));
  }
  const headerBlock = Buffer.concat(headerParts);
  const netstringLength = headerBlock.length;

  return new Uint8Array(
    Buffer.concat([
      Buffer.from(`${netstringLength}:`, "utf8"),
      headerBlock,
      Buffer.from(`,${body}`, "utf8"),
    ]),
  );
}

/**
 * SCGI responses are HTTP-shaped: `Status/Content-Length` header block, blank
 * line, then the XML-RPC payload.
 */
export function splitScgiResponse(raw: string): string {
  const separator = raw.indexOf("\r\n\r\n");
  return separator === -1 ? raw : raw.slice(separator + 4);
}

export type ScgiTarget =
  | { readonly kind: "tcp"; readonly host: string; readonly port: number }
  | { readonly kind: "unix"; readonly path: string };

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * A transport sends one XML-RPC document and resolves with the XML payload of
 * the response (SCGI framing is the transport's concern, not the client's).
 */
export interface ScgiTransportShape {
  readonly request: (xml: string) => Effect.Effect<string, TorrentClientUnavailableError>;
}

const transportError = (cause: unknown, message: string) =>
  TorrentClientUnavailableError.make({ cause, message });

/**
 * One request per connection: rTorrent SCGI traffic is low-volume control
 * traffic, and per-request sockets keep failure isolation trivial (a stuck
 * response can never poison the next call).
 */
export const makeScgiTransport = (target: ScgiTarget): Effect.Effect<ScgiTransportShape> =>
  Effect.sync(() => {
    const connectOptions: Net.NetConnectOpts =
      target.kind === "tcp" ? { host: target.host, port: target.port } : { path: target.path };

    const request = (xml: string): Effect.Effect<string, TorrentClientUnavailableError> =>
      Effect.gen(function* () {
        const encoded = encodeScgiRequest(
          {
            CONTENT_LENGTH: String(Buffer.byteLength(xml, "utf8")),
            SCGI: "1",
          },
          xml,
        );

        const socket = yield* NetSocket.makeNet({
          ...connectOptions,
          openTimeout: "10 seconds",
        }).pipe(
          Effect.mapError((cause) => transportError(cause, "rTorrent SCGI connection failed")),
        );

        const responseDeferred = yield* Deferred.make<string, TorrentClientUnavailableError>();
        const chunks: Array<Buffer> = [];

        const complete = (body: string) =>
          Deferred.unsafeDone(responseDeferred, Exit.succeed(body));

        const readerFiber = yield* Effect.forkScoped(
          socket
            .run<never, TorrentClientUnavailableError>((chunk) => {
              chunks.push(Buffer.from(chunk));
              const concatenated = Buffer.concat(chunks);
              const text = concatenated.toString("utf8");
              const separator = text.indexOf("\r\n\r\n");

              if (separator === -1) {
                if (concatenated.length > MAX_RESPONSE_BYTES) {
                  Deferred.unsafeDone(
                    responseDeferred,
                    Exit.fail(transportError(undefined, "rTorrent SCGI header block too large")),
                  );
                }
                return;
              }

              const contentLength = /Content-Length:\s*(\d+)/i.exec(text.slice(0, separator));
              const bodyBytes = concatenated.length - separator - 4;

              if (!contentLength) {
                complete(text.slice(separator + 4));
                return;
              }

              if (bodyBytes >= Number(contentLength[1])) {
                complete(text.slice(separator + 4));
              }
            })
            .pipe(
              Effect.zipRight(
                Deferred.fail(
                  responseDeferred,
                  transportError(undefined, "rTorrent closed the SCGI connection"),
                ),
              ),
            ),
        );

        const writer = yield* socket.writer;
        yield* writer(encoded).pipe(
          Effect.mapError((cause) => transportError(cause, "rTorrent SCGI write failed")),
        );

        const response = yield* Deferred.await(responseDeferred);

        yield* Fiber.interrupt(readerFiber).pipe(Effect.orDie);
        return response;
      }).pipe(Effect.scoped);

    return { request } satisfies ScgiTransportShape;
  });

/**
 * Reverse-proxied SCGI endpoint (nginx `scgi_pass`, Apache `ProxyPass`): the
 * proxy speaks SCGI to rTorrent and plain HTTP to us, so requests are ordinary
 * XML-RPC POSTs. Matches Sonarr's transport model.
 */
export const makeHttpTransport = (url: string): ScgiTransportShape => ({
  request: (xml) =>
    Effect.tryPromise({
      try: () =>
        fetch(url, {
          body: xml,
          headers: { "Content-Type": "text/xml" },
          method: "POST",
        }).then((response) =>
          response.text().then((text) => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            return text;
          }),
        ),
      catch: (cause) => transportError(cause, "rTorrent HTTP request failed"),
    }),
});

/**
 * Resolve the configured rTorrent URL into a transport:
 * `scgi://host:port` / `scgi:///path` → raw SCGI, `http(s)://` → proxied RPC.
 */
export const makeTransportFromUrl = (
  url: string,
): Effect.Effect<ScgiTransportShape, TorrentClientUnavailableError> => {
  const lower = url.toLowerCase();

  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return Effect.succeed(makeHttpTransport(url));
  }

  if (lower.startsWith("scgi://")) {
    const target = url.slice("scgi://".length);

    if (target.startsWith("/")) {
      return makeScgiTransport({ kind: "unix", path: target });
    }

    const lastColon = target.lastIndexOf(":");
    const port = Number(target.slice(lastColon + 1));
    if (lastColon > 0 && Number.isInteger(port) && port > 0 && port <= 65535) {
      return makeScgiTransport({ kind: "tcp", host: target.slice(0, lastColon), port });
    }

    return Effect.fail(
      TorrentClientUnavailableError.make({
        message: "rTorrent SCGI URL is invalid (expected scgi://host:port or scgi:///path)",
      }),
    );
  }

  return Effect.fail(
    TorrentClientUnavailableError.make({
      message: "rTorrent URL must use scgi:// or http(s)://",
    }),
  );
};
