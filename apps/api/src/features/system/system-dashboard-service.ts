import { Context, Effect, Layer } from "effect";

import type { OpsDashboard } from "@packages/shared/index.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import {
  BackgroundJobStatusError,
} from "@/features/system/background-job-status-service.ts";
import {
  SystemSummaryService,
} from "@/features/system/system-summary-service.ts";

export interface SystemDashboardServiceShape {
  readonly getDashboard: () => Effect.Effect<
    OpsDashboard,
    BackgroundJobStatusError | OperationsStoredDataError
  >;
}

export class SystemDashboardService extends Context.Tag("@bakarr/api/SystemDashboardService")<
  SystemDashboardService,
  SystemDashboardServiceShape
>() {}

export const SystemDashboardServiceLive = Layer.effect(
  SystemDashboardService,
  Effect.gen(function* () {
    const summaryService = yield* SystemSummaryService;

    const getDashboard = Effect.fn("SystemDashboardService.getDashboard")(function* () {
      return yield* summaryService.getDashboardSummary();
    });

    return { getDashboard } satisfies SystemDashboardServiceShape;
  }),
);
