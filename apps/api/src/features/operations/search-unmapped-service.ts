import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService, nowIsoFromClock } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { AniListClient } from "../anime/anilist.ts";
import { AnimeImportService } from "../anime/import-service.ts";
import { makeUnmappedOrchestrationSupport } from "./unmapped-orchestration-support.ts";
import { OperationsSharedState } from "./runtime-support.ts";
import { toDatabaseError, tryDatabasePromise } from "../../lib/effect-db.ts";

export type SearchUnmappedServiceShape = ReturnType<typeof makeUnmappedOrchestrationSupport>;

export class SearchUnmappedService extends Context.Tag("@bakarr/api/SearchUnmappedService")<
  SearchUnmappedService,
  SearchUnmappedServiceShape
>() {}

export const SearchUnmappedServiceLive = Layer.effect(
  SearchUnmappedService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const aniList = yield* AniListClient;
    const animeImportService = yield* AnimeImportService;
    const fs = yield* FileSystem;
    const clock = yield* ClockService;
    const sharedState = yield* OperationsSharedState;

    return makeUnmappedOrchestrationSupport({
      aniList,
      animeImportService,
      coordination: sharedState,
      db,
      dbError: toDatabaseError,
      fs,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });
  }),
);
