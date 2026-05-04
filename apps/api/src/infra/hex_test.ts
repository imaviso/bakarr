import { assert, it } from "@effect/vitest";
import { Option } from "effect";

import { bytesToHex, hexToBytes } from "@/infra/hex.ts";

it("bytesToHex encodes bytes as lowercase hex", () => {
  assert.deepStrictEqual(bytesToHex(new Uint8Array([0, 15, 16, 255])), "000f10ff");
});

it("hexToBytes decodes mixed-case even-length hex", () => {
  const decoded = hexToBytes("00Af10FF");

  assert.deepStrictEqual(Option.isSome(decoded), true);
  if (Option.isSome(decoded)) {
    assert.deepStrictEqual([...decoded.value], [0, 175, 16, 255]);
  }
});

it("hexToBytes rejects odd-length and non-hex strings", () => {
  assert.deepStrictEqual(Option.isNone(hexToBytes("abc")), true);
  assert.deepStrictEqual(Option.isNone(hexToBytes("zz")), true);
});
