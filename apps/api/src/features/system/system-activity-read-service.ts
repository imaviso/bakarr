import { Context, Effect, Layer } from "effect";

import type { ActivityItem } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { listRecentSystemLogRows } from "@/features/system/repository/stats-repository.ts";

export interface SystemActivityReadServiceShape {
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
}

export class SystemActivityReadService extends Context.Tag("@bakarr/api/SystemActivityReadService")<
  SystemActivityReadService,
  SystemActivityReadServiceShape
>() {}

export const SystemActivityReadServiceLive = Layer.effect(
  SystemActivityReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;

    const getActivity = Effect.fn("SystemActivityReadService.getActivity")(function* () {
      const rows = yield* listRecentSystemLogRows(db, 20);

      return rows.map(
        (row) =>
          ({
            activity_type: row.eventType,
            anime_id: 0,
            anime_title: "Bakarr",
            description: row.message,
            id: row.id,
            timestamp: row.createdAt,
          }) satisfies ActivityItem,
      );
    });

    return SystemActivityReadService.of({ getActivity });
  }),
);
