import { Effect, Schema } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/lib/logging.ts";

export type ConfigActivationEvent =
  | "config.validation"
  | "config.persisted"
  | "config.activated"
  | "config.activation_failed"
  | "config.rollback_failed";

const PersistedSystemConfigCoreRowSchema = Schema.Struct({
  data: Schema.String,
  id: Schema.Number,
  updatedAt: Schema.String,
});

const QualityProfileInsertSchema = Schema.Struct({
  allowedQualities: Schema.String,
  cutoff: Schema.String,
  maxSize: Schema.NullOr(Schema.String),
  minSize: Schema.NullOr(Schema.String),
  name: Schema.String,
  seadexPreferred: Schema.Boolean,
  upgradeAllowed: Schema.Boolean,
});

export const PersistedSystemConfigStateSchema = Schema.Struct({
  coreRow: PersistedSystemConfigCoreRowSchema,
  profileRows: Schema.Array(QualityProfileInsertSchema),
});

export type PersistedSystemConfigState = Schema.Schema.Type<
  typeof PersistedSystemConfigStateSchema
>;

export const persistAndActivateConfig = Effect.fn(
  "SystemConfigUpdateService.persistAndActivateConfig",
)(function* <E>(input: {
  readonly activateConfig: (config: Config) => Effect.Effect<void, E>;
  readonly nextConfig: Config;
  readonly nextState: PersistedSystemConfigState;
  readonly persistState: (state: PersistedSystemConfigState) => Effect.Effect<void, DatabaseError>;
  readonly previousState: PersistedSystemConfigState;
  readonly recordEvent?: (event: ConfigActivationEvent, error?: unknown) => Effect.Effect<void>;
}) {
  const recordEvent = input.recordEvent ?? defaultRecordConfigActivationEvent;

  yield* recordEvent("config.validation");
  yield* input.persistState(input.nextState);
  yield* recordEvent("config.persisted");

  const activationResult = yield* Effect.either(input.activateConfig(input.nextConfig));

  if (activationResult._tag === "Right") {
    yield* recordEvent("config.activated");
    return;
  }

  yield* recordEvent("config.activation_failed", activationResult.left);

  const rollbackResult = yield* Effect.either(input.persistState(input.previousState));

  if (rollbackResult._tag === "Left") {
    yield* recordEvent("config.rollback_failed", rollbackResult.left);
    yield* rollbackResult.left;
    return;
  }

  yield* Effect.fail(activationResult.left);
  return;
});

function defaultRecordConfigActivationEvent(event: ConfigActivationEvent, error?: unknown) {
  const annotations = compactLogAnnotations({
    component: "system",
    event,
    ...errorLogAnnotations(error),
  });

  const logEffect =
    event === "config.activation_failed" || event === "config.rollback_failed"
      ? Effect.logError("system config transition")
      : Effect.logInfo("system config transition");

  return logEffect.pipe(Effect.annotateLogs(annotations));
}
