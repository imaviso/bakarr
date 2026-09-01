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

export interface ScgiTransportShape {
  readonly request: (encoded: Uint8Array) => Effect.Effect<string, TorrentClientUnavailableError>;
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

    const request = (encoded: Uint8Array): Effect.Effect<string, TorrentClientUnavailableError> =>
      Effect.gen(function* () {
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
