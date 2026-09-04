import { assert, it } from "@effect/vitest";
import { decodeNotificationEventWire } from "@packages/shared/index.ts";
import { encodeNotificationEventJson } from "@/app/event-socket.ts";
import { Effect } from "effect";

it.effect("encodeNotificationEventJson serializes valid notification events", () =>
  Effect.gen(function* () {
    const encoded = yield* encodeNotificationEventJson({
      payload: { message: "hello" },
      type: "Info",
    });

    const decoded = decodeNotificationEventWire(encoded);

    assert.deepStrictEqual(decoded._tag, "Success");

    if (decoded._tag === "Success") {
      assert.deepStrictEqual(decoded.success, {
        payload: { message: "hello" },
        type: "Info",
      });
    }
  }),
);
