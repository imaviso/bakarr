import { Effect } from "effect";

import { SystemStatusService } from "../features/system/system-status-service.ts";

const notReadyResponse = { checks: { database: false }, ready: false } as const;

export const getHealthReadyState = Effect.fn("Http.getHealthReadyState")(function* () {
  const service = yield* SystemStatusService;

  return yield* service.getSystemStatus().pipe(
    Effect.map(() => ({ checks: { database: true }, ready: true }) as const),
    Effect.catchTags({
      DatabaseError: () => Effect.succeed(notReadyResponse),
      DiskSpaceError: () => Effect.succeed(notReadyResponse),
      StoredConfigCorruptError: () => Effect.succeed(notReadyResponse),
      StoredConfigMissingError: () => Effect.succeed(notReadyResponse),
    }),
  );
});
