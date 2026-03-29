import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { makeSearchReleaseSupport } from "@/features/operations/search-orchestration-release-search.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import { SeaDexClient } from "@/features/operations/seadex-client.ts";

export type SearchReleaseServiceShape = ReturnType<typeof makeSearchReleaseSupport>;

export class SearchReleaseService extends Context.Tag("@bakarr/api/SearchReleaseService")<
  SearchReleaseService,
  SearchReleaseServiceShape
>() {}

export const SearchReleaseServiceLive = Layer.effect(
  SearchReleaseService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const rssClient = yield* RssClient;
    const seadexClient = yield* SeaDexClient;

    return makeSearchReleaseSupport({
      db,
      rssClient,
      seadexClient,
    });
  }),
);
