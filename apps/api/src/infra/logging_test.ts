import { assert, it } from "@effect/vitest";
import { Cause, Effect, Layer, Redacted, Schema } from "effect";

import { ObservabilityConfig, makeDefaultObservabilityConfig } from "@/app/config/observability.ts";
import {
  causeLogAnnotations,
  errorCategory,
  errorLogAnnotations,
  makeRuntimeLoggerLayer,
  RuntimeLogLevelState,
  RuntimeLogSink,
} from "@/infra/logging.ts";

const LogEntry = Schema.fromJsonString(
  Schema.Struct({
    level: Schema.String,
    message: Schema.String,
    traceId: Schema.optional(Schema.String),
    spanId: Schema.optional(Schema.String),
    resource: Schema.Struct({
      "service.name": Schema.String,
      "service.version": Schema.String,
      "deployment.environment.name": Schema.String,
    }),
    annotations: Schema.Record(Schema.String, Schema.Unknown),
  }),
);

it.effect(
  "runtime logger emits structured deployment and trace context without exposing Redacted values",
  () =>
    Effect.gen(function* () {
      const lines: string[] = [];
      const loggerLayer = Layer.unwrap(makeRuntimeLoggerLayer()).pipe(
        Layer.provideMerge(RuntimeLogLevelState.layer),
        Layer.provide(
          Layer.succeed(RuntimeLogSink, {
            write: ({ line }) => {
              lines.push(line);
            },
          }),
        ),
        Layer.provide(
          Layer.succeed(
            ObservabilityConfig,
            Object.assign(makeDefaultObservabilityConfig("test-version"), {
              deploymentEnvironment: "test",
            }),
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const state = yield* RuntimeLogLevelState;
        yield* Effect.logDebug("filtered");
        yield* state.set("debug");
        yield* Effect.logDebug("completed").pipe(
          Effect.annotateLogs({
            requestId: "request-1",
            credential: Redacted.make("secret-value"),
          }),
          Effect.withSpan("test.operation"),
        );
      }).pipe(Effect.provide(loggerLayer));

      assert.strictEqual(lines.length, 1);
      const entry = yield* Schema.decodeUnknownEffect(LogEntry)(lines[0]);
      assert.strictEqual(entry.level, "DEBUG");
      assert.strictEqual(entry.message, "completed");
      assert.strictEqual(entry.resource["service.name"], "bakarr-api");
      assert.strictEqual(entry.resource["service.version"], "test-version");
      assert.strictEqual(entry.resource["deployment.environment.name"], "test");
      assert.strictEqual(entry.annotations["requestId"], "request-1");
      assert.isNotEmpty(entry.traceId);
      assert.isNotEmpty(entry.spanId);
      assert.isFalse(lines.join("").includes("secret-value"));
    }),
);

it("errorCategory names tagged failures, defects, and interrupts", () => {
  class Boom extends Error {}

  const tagged = Cause.fail({ _tag: "AuthUnauthorizedError", message: "nope" });
  const plain = Cause.fail(new Boom("plain"));
  const defect = Cause.die(new Error("boom"));
  const interrupted = Cause.interrupt(2);

  assert.strictEqual(errorCategory(tagged), "AuthUnauthorizedError");
  assert.strictEqual(errorCategory(plain), "Boom");
  assert.strictEqual(errorCategory(defect), "defect");
  assert.strictEqual(errorCategory(interrupted), "interrupted");
});

it("nested error causes are summarized, never serialized wholesale", () => {
  const nested = {
    _tag: "DatabaseError",
    message: "db failed",
    cause: { sql: "SELECT * FROM users", rows: [1, 2, 3] },
  };
  const annotations = errorLogAnnotations(nested);

  assert.strictEqual(annotations["errorName"], "DatabaseError");
  assert.strictEqual(annotations["errorMessage"], "db failed");
  assert.strictEqual(annotations["errorCause"], "object");
  assert.isFalse(JSON.stringify(annotations).includes("SELECT"));

  const defectAnnotations = causeLogAnnotations(Cause.die(new Error("boom")));
  assert.strictEqual(defectAnnotations["error_kind"], "defect");
  assert.strictEqual(defectAnnotations["errorMessage"], "boom");
  assert.strictEqual(defectAnnotations["errorName"], "Error");
});

it.effect("runtime log level accepts fatal and none", () =>
  Effect.gen(function* () {
    const state = yield* RuntimeLogLevelState;

    yield* state.set("fatal");
    assert.strictEqual(yield* state.get, "Fatal");

    yield* state.set("none");
    assert.strictEqual(yield* state.get, "None");
  }).pipe(Effect.provide(RuntimeLogLevelState.layer)),
);
