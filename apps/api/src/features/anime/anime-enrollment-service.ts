import { Context, Effect, Layer } from "effect";

import type { Anime } from "../../../../../packages/shared/src/index.ts";
import type { DatabaseError } from "../../db/database.ts";
import type { ExternalCallError } from "../../lib/effect-retry.ts";
import { SearchOrchestration } from "../operations/operations-orchestration.ts";
import type { ProfileNotFoundError } from "../system/errors.ts";
import type { AddAnimeInput } from "./add-anime-input.ts";
import type { AnimeServiceError } from "./errors.ts";
import { AnimeMutationService } from "./service.ts";

export type AnimeEnrollmentError =
  | DatabaseError
  | AnimeServiceError
  | ProfileNotFoundError
  | ExternalCallError;

export interface AnimeEnrollmentServiceShape {
  /**
   * Add an anime entry and, when `monitor_and_search` is set, immediately
   * kick off a missing-episode search. This keeps cross-service orchestration
   * out of the HTTP layer.
   */
  readonly enroll: (input: AddAnimeInput) => Effect.Effect<Anime, AnimeEnrollmentError>;
}

export class AnimeEnrollmentService extends Context.Tag("@bakarr/api/AnimeEnrollmentService")<
  AnimeEnrollmentService,
  AnimeEnrollmentServiceShape
>() {}

const makeAnimeEnrollmentService = Effect.gen(function* () {
  const animeService = yield* AnimeMutationService;
  const searchService = yield* SearchOrchestration;

  const enroll = Effect.fn("AnimeEnrollmentService.enroll")(function* (input: AddAnimeInput) {
    const anime = yield* animeService.addAnime(input);

    if (input.monitor_and_search) {
      yield* searchService.triggerSearchMissing(anime.id);
    }

    return anime;
  });

  return { enroll } satisfies AnimeEnrollmentServiceShape;
});

export const AnimeEnrollmentServiceLive = Layer.effect(
  AnimeEnrollmentService,
  makeAnimeEnrollmentService,
);
