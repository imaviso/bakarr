import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Context, Effect, Either, Layer } from "effect";

import { ClockService } from "../../lib/clock.ts";
import { DnsResolver } from "../../lib/dns-resolver.ts";
import { ExternalCallError, makeTryExternalEffect } from "../../lib/effect-retry.ts";
import { RssFeedParseError, RssFeedRejectedError, RssFeedTooLargeError } from "./errors.ts";
import {
  readRssItems,
  type ParsedRelease,
} from "./rss-client-parse.ts";
import { validateUrlForSsrf } from "./rss-client-ssrf.ts";

export { RssFeedParseError, RssFeedRejectedError, RssFeedTooLargeError } from "./errors.ts";
export { ParsedReleaseSchema } from "./rss-client-parse.ts";
export type { ParsedRelease } from "./rss-client-parse.ts";

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

const makeFetchItems = (
  client: HttpClient.HttpClient,
  dns: typeof DnsResolver.Service,
  tryExternalEffect: ReturnType<typeof makeTryExternalEffect>,
) =>
  Effect.fn("RssClient.fetchItems")(function* (url: string) {
    const parsedUrl = yield* Effect.try({
      try: () => new URL(url),
      catch: () =>
        new RssFeedRejectedError({
          message: `RSS feed URL is invalid: ${url}`,
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
          Effect.annotateLogs({ url: currentUrl, hop }),
        );
        return yield* new RssFeedRejectedError({
          message: "RSS feed rejected: redirect loop detected",
        });
      }
      visitedUrls.add(currentUrl);

      const validationResult = yield* validateUrlForSsrf(currentUrl, dns);
      if (validationResult._tag === "Rejected") {
        yield* Effect.logWarning("RSS feed rejected by SSRF guardrail").pipe(
          Effect.annotateLogs({
            hop,
            reason: validationResult.reason,
            url: currentUrl,
          }),
        );
        return yield* new RssFeedRejectedError({
          message: validationResult.reason,
        });
      }

      const request = HttpClientRequest.get(currentUrl).pipe(
        HttpClientRequest.setHeader("Accept", "application/rss+xml, application/xml, text/xml"),
        HttpClientRequest.setHeader("User-Agent", "bakarr/1.0"),
      );

      const response = yield* tryExternalEffect("rss.fetch", client.execute(request))();

      if (response.status >= 200 && response.status < 300) {
        const itemsResult = yield* Effect.either(readRssItems(response.stream));
        if (Either.isLeft(itemsResult)) {
          yield* Effect.logWarning(itemsResult.left.message).pipe(
            Effect.annotateLogs({ url: currentUrl }),
          );
          return yield* itemsResult.left;
        }
        return itemsResult.right;
      }

      if (response.status >= 300 && response.status < 400) {
        const { location } = response.headers;
        if (!location || typeof location !== "string") {
          return yield* ExternalCallError.make({
            cause: new Error(`Redirect without location header`),
            message: `RSS feed returned redirect ${response.status} without location`,
            operation: "rss.fetch.redirect",
          });
        }

        const redirectResult = yield* Effect.try({
          try: () => new URL(location, currentUrl),
          catch: () => new InvalidRedirectUrlError(location),
        }).pipe(Effect.either);

        if (Either.isLeft(redirectResult)) {
          return yield* ExternalCallError.make({
            cause: redirectResult.left,
            message: `RSS feed returned invalid redirect URL`,
            operation: "rss.fetch.redirect",
          });
        }

        const redirectUrl = redirectResult.right;

        if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
          yield* Effect.logWarning("RSS feed rejected: redirect to disallowed scheme").pipe(
            Effect.annotateLogs({
              redirectUrl: redirectUrl.href,
              url: currentUrl,
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
      Effect.annotateLogs({ redirectCount: MAX_REDIRECT_HOPS, url }),
    );
    return yield* new RssFeedRejectedError({
      message: "RSS feed rejected: too many redirects",
    });
  });

export const RssClientLive = Layer.effect(
  RssClient,
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;
    const dns = yield* DnsResolver;
    const tryExternalEffect = makeTryExternalEffect(clock);

    const client = baseClient.pipe(
      HttpClient.transformResponse(
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "manual",
        }),
      ),
    );

    return {
      fetchItems: makeFetchItems(client, dns, tryExternalEffect),
    } satisfies RssClientShape;
  }),
);

class InvalidRedirectUrlError extends Error {
  constructor(readonly location: string) {
    super(`Invalid redirect URL: ${location}`);
    this.name = "InvalidRedirectUrlError";
  }
}
