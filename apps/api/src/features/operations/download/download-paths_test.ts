import { assert, it } from "@effect/vitest";
import { Option } from "effect";

import {
  applyRemotePathMappings,
  parseMagnetInfoHash,
} from "@/features/operations/download/download-paths.ts";

function optionValue<A>(option: Option.Option<A>) {
  return Option.isSome(option) ? option.value : undefined;
}

it("parseMagnetInfoHash extracts and lowercases btih hashes", () => {
  assert.deepStrictEqual(
    optionValue(parseMagnetInfoHash("magnet:?dn=Show&xt=urn:btih:ABCDEF1234&tr=udp://tracker")),
    "abcdef1234",
  );
  assert.deepStrictEqual(
    optionValue(parseMagnetInfoHash("magnet:?xt=URN:BTIH:DEADBEEF")),
    "deadbeef",
  );
});

it("parseMagnetInfoHash returns none for missing input or non-magnet values", () => {
  assert.deepStrictEqual(Option.isNone(parseMagnetInfoHash(undefined)), true);
  assert.deepStrictEqual(Option.isNone(parseMagnetInfoHash(null)), true);
  assert.deepStrictEqual(Option.isNone(parseMagnetInfoHash("https://example.com/torrent")), true);
});

it("applyRemotePathMappings rewrites exact and nested prefixes", () => {
  assert.deepStrictEqual(
    applyRemotePathMappings("/remote/downloads/Show/E01.mkv", [
      ["/remote/downloads/", "/local/downloads/"],
      ["/other", "/unused"],
    ]),
    ["/local/downloads/Show/E01.mkv"],
  );
  assert.deepStrictEqual(
    applyRemotePathMappings("/remote/downloads", [["/remote/downloads/", "/local/downloads/"]]),
    ["/local/downloads"],
  );
});

it("applyRemotePathMappings ignores invalid mappings and partial prefix collisions", () => {
  assert.deepStrictEqual(
    applyRemotePathMappings("/remote/downloads-extra/file.mkv", [
      ["/remote/downloads", "/local/downloads"],
      ["", "/local"],
      ["/remote", ""],
    ]),
    [],
  );
});
