import { Effect } from "effect";

import { assert, it } from "@effect/vitest";
import { decodeNotificationEventWire } from "@packages/shared/index.ts";
import { encodeNotificationEventJson } from "@/http/event-socket.ts";

it.effect("encodeNotificationEventJson serializes valid notification events", () =>
  Effect.gen(function* () {
    const encoded = yield* encodeNotificationEventJson({
      payload: { message: "hello" },
      type: "Info",
    });

    const decoded = decodeNotificationEventWire(encoded);

    assert.deepStrictEqual(decoded._tag, "Right");

    if (decoded._tag === "Right") {
      assert.deepStrictEqual(decoded.right, {
        payload: { message: "hello" },
        type: "Info",
      });
    }
  }),
);
