import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { makeSearchImportPathSupport } from "@/features/operations/search-orchestration-import-path-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type SearchImportPathServiceShape = ReturnType<typeof makeSearchImportPathSupport>;

export class SearchImportPathService extends Context.Tag("@bakarr/api/SearchImportPathService")<
  SearchImportPathService,
  SearchImportPathServiceShape
>() {}

export const SearchImportPathServiceLive = Layer.effect(
  SearchImportPathService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const aniList = yield* AniListClient;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;

    return makeSearchImportPathSupport({
      aniList,
      db,
      fs,
      mediaProbe,
      tryDatabasePromise,
    });
  }),
);
