import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";

export interface BackgroundSearchRssRunnerServiceShape {
  readonly fetchItems: (
    url: string,
  ) => Effect.Effect<
    readonly import("@/features/operations/rss-client-parse.ts").ParsedRelease[],
    | DatabaseError
    | ExternalCallError
    | RssFeedParseError
    | RssFeedRejectedError
    | RssFeedTooLargeError
  >;
}

export class BackgroundSearchRssRunnerService extends Context.Tag(
  "@bakarr/api/BackgroundSearchRssRunnerService",
)<BackgroundSearchRssRunnerService, BackgroundSearchRssRunnerServiceShape>() {}

export const BackgroundSearchRssRunnerServiceLive = Layer.effect(
  BackgroundSearchRssRunnerService,
  Effect.gen(function* () {
    const rssClient = yield* RssClient;

    const fetchItems = Effect.fn("BackgroundSearchRssRunnerService.fetchItems")((url: string) =>
      rssClient.fetchItems(url),
    );

    return BackgroundSearchRssRunnerService.of({
      fetchItems,
    });
  }),
);
