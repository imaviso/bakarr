import { Cause, Effect, Exit, Option, Stream } from "effect";
import { assert, it } from "@effect/vitest";

import {
  collectBoundedBytes,
  collectBoundedText,
  StreamPayloadTooLargeError,
} from "@/domain/bounded-stream.ts";

it("collectBoundedBytes collects all chunks under limit", () =>
  Effect.gen(function* () {
    const stream = Stream.fromIterable([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    const result = yield* collectBoundedBytes(stream, 10);
    assert.deepStrictEqual([...result], [1, 2, 3, 4]);
  }));

it("collectBoundedBytes fails when accumulated bytes exceed max", () =>
  Effect.gen(function* () {
    const stream = Stream.fromIterable([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);
    const exit = yield* Effect.exit(collectBoundedBytes(stream, 4));
    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.ok(Option.isSome(failure));
      assert.ok(failure.value instanceof StreamPayloadTooLargeError);
      assert.deepStrictEqual(failure.value.actualBytes, 6);
      assert.deepStrictEqual(failure.value.maxBytes, 4);
    }
  }));

it("collectBoundedBytes reports actualBytes and maxBytes on error", () =>
  Effect.gen(function* () {
    const stream = Stream.fromIterable([new Uint8Array(5), new Uint8Array(3)]);
    const exit = yield* Effect.exit(collectBoundedBytes(stream, 4));
    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.ok(Option.isSome(failure));
      assert.ok(failure.value instanceof StreamPayloadTooLargeError);
      assert.deepStrictEqual(failure.value.actualBytes, 5);
      assert.deepStrictEqual(failure.value.maxBytes, 4);
    }
  }));

it("collectBoundedBytes succeeds with empty stream", () =>
  Effect.gen(function* () {
    const stream = Stream.empty;
    const result = yield* collectBoundedBytes(stream, 10);
    assert.deepStrictEqual([...result], []);
  }));

it("collectBoundedText decodes text chunks under limit", () =>
  Effect.gen(function* () {
    const encoder = new TextEncoder();
    const stream = Stream.fromIterable([encoder.encode("hello "), encoder.encode("world")]);
    const result = yield* collectBoundedText(stream, 100);
    assert.deepStrictEqual(result, "hello world");
  }));

it("collectBoundedText fails when text exceeds max", () =>
  Effect.gen(function* () {
    const encoder = new TextEncoder();
    const stream = Stream.fromIterable([encoder.encode("too long")]);
    const exit = yield* Effect.exit(collectBoundedText(stream, 3));
    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.ok(Option.isSome(failure));
      assert.ok(failure.value instanceof StreamPayloadTooLargeError);
      assert.deepStrictEqual(failure.value.actualBytes, 8);
      assert.deepStrictEqual(failure.value.maxBytes, 3);
    }
  }));
