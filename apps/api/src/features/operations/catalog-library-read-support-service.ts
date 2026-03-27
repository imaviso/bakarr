import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService } from "../../lib/clock.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { makeCatalogLibraryReadSupport } from "./catalog-library-read-support.ts";
import type { CatalogLibraryReadSupportShape } from "./catalog-library-read-support.ts";

export class CatalogLibraryReadSupport extends Context.Tag("@bakarr/api/CatalogLibraryReadSupport")<
  CatalogLibraryReadSupport,
  CatalogLibraryReadSupportShape
>() {}

export const CatalogLibraryReadSupportLive = Layer.effect(
  CatalogLibraryReadSupport,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;

    return makeCatalogLibraryReadSupport({
      currentTimeMillis: () => clock.currentTimeMillis,
      db,
      tryDatabasePromise,
    });
  }),
);
