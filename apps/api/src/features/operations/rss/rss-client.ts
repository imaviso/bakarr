import { Context, Effect, Either, Layer, Option, Stream } from "effect";

import { DnsResolver } from "@/infra/dns-resolver.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { readRssItems, type ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import {
  resolvePinnedRequestTarget,
  type PinnedRequestTarget,
} from "@/features/operations/rss/rss-client-ssrf.ts";
import {
  RssTransport,
  RssTransportPayloadTooLargeError,
  type RssTransportResponse,
} from "@/features/operations/rss/rss-transport.ts";

interface RssClientShape {
  readonly fetchItems: (
    url: string,
  ) => Effect.Effect<
    readonly ParsedRelease[],
    ExternalCallError | RssFeedParseError | RssFeedRejectedError | RssFeedTooLargeError
  >;
}

export class RssClient extends Context.Tag("@bakarr/api/RssClient")<RssClient, RssClientShape>() {}

const MAX_REDIRECT_HOPS = 5;

const isRetryableRssFetchError = (error: ExternalCallError) =>
  !(error.cause instanceof RssTransportPayloadTooLargeError);

const makeFetchItems = (
  executeRequest: (target: PinnedRequestTarget) => Effect.Effect<RssTransportResponse, unknown>,
  dns: typeof DnsResolver.Service,
  externalCall: ExternalCallShape,
) =>
  Effect.fn("RssClient.fetchItems")(function* (url: string) {
    const parsedUrl = yield* Effect.try({
      try: () => new URL(url),
      catch: (cause) =>
        new RssFeedRejectedError({
          cause,
          message: "RSS feed URL is invalid",
        }),
    });

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return yield* new RssFeedRejectedError({
        message: `RSS feed URL uses a disallowed protocol: ${parsedUrl.protocol}`,
      });
    }

    const visitedUrls = new Set<string>();
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      if (visitedUrls.has(currentUrl)) {
        yield* Effect.logWarning("RSS feed rejected: redirect loop detected").pipe(
          Effect.annotateLogs({ hop, rss_url: sanitizeRssUrlForLogs(currentUrl) }),
        );
        return yield* new RssFeedRejectedError({
          message: "RSS feed rejected: redirect loop detected",
        });
      }
      visitedUrls.add(currentUrl);

      const target = (yield* resolvePinnedRequestTarget(currentUrl, dns).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("RSS feed rejected by SSRF guardrail").pipe(
            Effect.annotateLogs({
              hop,
              reason: error.message,
              rss_url: sanitizeRssUrlForLogs(currentUrl),
            }),
          ),
        ),
      )) satisfies PinnedRequestTarget;
      const response = yield* externalCall
        .tryExternalEffect("rss.fetch", executeRequest(target), {
          isRetryableError: isRetryableRssFetchError,
        })
        .pipe(
          Effect.mapError((error) =>
            error.cause instanceof RssTransportPayloadTooLargeError
              ? new RssFeedTooLargeError({
                  cause: error.cause,
                  message: error.cause.message,
                })
              : error,
          ),
        );

      if (response.status >= 400) {
        yield* Effect.logWarning("RSS feed returned upstream error status").pipe(
          Effect.annotateLogs({
            rss_status: response.status,
            rss_url: sanitizeRssUrlForLogs(currentUrl),
          }),
        );
      }

      if (response.status >= 200 && response.status < 300) {
        const itemsResult = yield* Effect.either(
          readRssItems(Stream.fromIterable([response.body])),
        );
        if (Either.isLeft(itemsResult)) {
          yield* Effect.logWarning(itemsResult.left.message).pipe(
            Effect.annotateLogs({ rss_url: sanitizeRssUrlForLogs(currentUrl) }),
          );
          return yield* itemsResult.left;
        }
        return itemsResult.right;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return yield* ExternalCallError.make({
            cause: new Error(`Redirect without location header`),
            message: `RSS feed returned redirect ${response.status} without location`,
            operation: "rss.fetch.redirect",
          });
        }

        const redirectResult = yield* Effect.try({
          try: () => new URL(location, currentUrl),
          catch: (cause) =>
            new RssFeedRejectedError({
              cause,
              message: "Invalid redirect URL",
            }),
        }).pipe(Effect.either);

        if (Either.isLeft(redirectResult)) {
          return yield* redirectResult.left;
        }

        const redirectUrl = redirectResult.right;

        if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
          yield* Effect.logWarning("RSS feed rejected: redirect to disallowed scheme").pipe(
            Effect.annotateLogs({
              redirect_url: sanitizeRssUrlForLogs(redirectUrl.href),
              rss_url: sanitizeRssUrlForLogs(currentUrl),
            }),
          );
          return yield* new RssFeedRejectedError({
            message: `RSS feed redirect uses a disallowed protocol: ${redirectUrl.protocol}`,
          });
        }

        currentUrl = redirectUrl.href;
        continue;
      }

      return yield* ExternalCallError.make({
        cause: new Error(`RSS feed returned HTTP ${response.status}`),
        message: `RSS feed returned HTTP ${response.status}`,
        operation: "rss.fetch.status",
      });
    }

    yield* Effect.logWarning("RSS feed rejected: too many redirects").pipe(
      Effect.annotateLogs({
        redirectCount: MAX_REDIRECT_HOPS,
        rss_url: sanitizeRssUrlForLogs(url),
      }),
    );
    return yield* new RssFeedRejectedError({
      message: "RSS feed rejected: too many redirects",
    });
  });

export const RssClientLive = Layer.effect(
  RssClient,
  Effect.gen(function* () {
    const dns = yield* DnsResolver;
    const externalCall = yield* ExternalCall;
    const transport = yield* RssTransport;

    return {
      fetchItems: makeFetchItems(transport.execute, dns, externalCall),
    } satisfies RssClientShape;
  }),
);

function sanitizeRssUrlForLogs(url: string): string {
  return Option.getOrElse(
    Option.liftThrowable(() => {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    })(),
    () => "[invalid-url]",
  );
}
