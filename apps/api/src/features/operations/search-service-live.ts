import { Effect, Layer } from "effect";

import { SearchOrchestration } from "./operations-orchestration.ts";
import { SearchService, type SearchServiceShape } from "./service-contract.ts";

export const SearchServiceLive = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const search = yield* SearchOrchestration;

    return {
      searchEpisode: search.searchEpisode,
      searchReleases: search.searchReleases,
    } satisfies SearchServiceShape;
  }),
);
