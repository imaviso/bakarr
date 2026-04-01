import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import {
  makeCatalogRssSupport,
  type CatalogRssSupportShape,
} from "@/features/operations/catalog-rss-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type CatalogRssServiceShape = CatalogRssSupportShape;

export class CatalogRssService extends Context.Tag("@bakarr/api/CatalogRssService")<
  CatalogRssService,
  CatalogRssServiceShape
>() {}

export const CatalogRssServiceLive = Layer.effect(
  CatalogRssService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;

    return makeCatalogRssSupport({
      db,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });
  }),
);
