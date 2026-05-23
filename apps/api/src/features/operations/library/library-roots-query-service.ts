import { Effect } from "effect";

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

const makeLibraryRootsQueryService = Effect.fn("LibraryRootsQueryService.make")(function* () {
  const operationsConfigRepository = yield* OperationsConfigRepository;

  const listRoots = Effect.fn("LibraryRootsQueryService.listRoots")(function* () {
    return yield* operationsConfigRepository.listLibraryRoots();
  });

  return { listRoots } satisfies LibraryRootsQueryServiceShape;
});

export class LibraryRootsQueryService extends Effect.Service<LibraryRootsQueryService>()(
  "@bakarr/api/LibraryRootsQueryService",
  { effect: makeLibraryRootsQueryService() },
) {}

export const LibraryRootsQueryServiceLive = LibraryRootsQueryService.Default;
