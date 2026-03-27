import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { setRuntimeLogLevel } from "../../lib/logging.ts";

export const applyRuntimeLogLevelFromConfig = Effect.fn(
  "SystemConfigService.applyRuntimeLogLevelFromConfig",
)(function* (config: Pick<Config, "general">) {
  yield* setRuntimeLogLevel(config.general.log_level);
});
