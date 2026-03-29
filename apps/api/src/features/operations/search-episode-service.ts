import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { makeSearchEpisodeSupport } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseService } from "@/features/operations/search-release-service.ts";

export type SearchEpisodeServiceShape = ReturnType<typeof makeSearchEpisodeSupport>;

export class SearchEpisodeService extends Context.Tag("@bakarr/api/SearchEpisodeService")<
  SearchEpisodeService,
  SearchEpisodeServiceShape
>() {}

export const SearchEpisodeServiceLive = Layer.effect(
  SearchEpisodeService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const searchReleaseService = yield* SearchReleaseService;

    return makeSearchEpisodeSupport({
      db,
      searchEpisodeReleases: searchReleaseService.searchEpisodeReleases,
    });
  }),
);
