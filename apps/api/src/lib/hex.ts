import { Option } from "effect";

const HEX_PATTERN = /^[0-9a-fA-F]*$/;

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function hexToBytes(value: string): Option.Option<Uint8Array> {
  if (value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    return Option.none();
  }

  return Option.some(Uint8Array.from(Buffer.from(value, "hex")));
}
