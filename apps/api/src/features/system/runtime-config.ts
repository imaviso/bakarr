import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { RuntimeLogLevelStateShape } from "@/infra/logging.ts";

export const applyRuntimeLogLevelFromConfig = Effect.fn(
  "SystemConfigService.applyRuntimeLogLevelFromConfig",
)(function* (state: RuntimeLogLevelStateShape, config: Pick<Config, "general">) {
  yield* state.set(config.general.log_level);
});
