import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { OperationsConfigRepository } from "@/features/operations/repository/config-repository.ts";

export interface LibraryRoot {
  readonly id: number;
  readonly label: string;
  readonly path: string;
}

export interface LibraryRootsQueryServiceShape {
  readonly listRoots: () => Effect.Effect<LibraryRoot[], DatabaseError>;
}

export class LibraryRootsQueryService extends Context.Tag("@bakarr/api/LibraryRootsQueryService")<
  LibraryRootsQueryService,
  LibraryRootsQueryServiceShape
>() {}

const makeLibraryRootsQueryService = Effect.fn("LibraryRootsQueryService.make")(function* () {
  const operationsConfigRepository = yield* OperationsConfigRepository;

  const listRoots = Effect.fn("LibraryRootsQueryService.listRoots")(function* () {
    return yield* operationsConfigRepository.listLibraryRoots();
  });

  return { listRoots } satisfies LibraryRootsQueryServiceShape;
});

export const LibraryRootsQueryServiceLive = Layer.effect(
  LibraryRootsQueryService,
  makeLibraryRootsQueryService(),
);
