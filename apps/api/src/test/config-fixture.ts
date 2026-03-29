/**
 * Test configuration helpers.
 *
 * Provides a single, schema-validated way to build `Config` values for tests
 * so test files do not need `structuredClone(... as unknown as Config)`.
 *
 * Overrides work on the encoded (plain object) form of `ConfigCore` so spread
 * operators do not trigger the `no-misused-spread` lint rule.
 */

import type { Config } from "@packages/shared/index.ts";
import { Schema } from "effect";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";
import {
  composeConfig,
  type ConfigCore,
  type ConfigCoreEncoded,
} from "@/features/system/config-codec.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";

export type { ConfigCore, ConfigCoreEncoded };

/**
 * Build a full `Config` suitable for use in tests.
 *
 * @param databasePath - the database path to embed in the config
 * @param override - optional function receiving the default `ConfigCoreEncoded`
 *   (plain object) and returning a modified version.  Use plain spread freely:
 *
 * ```ts
 * makeTestConfig("./test.sqlite", (c) => ({
 *   ...c,
 *   library: { ...c.library, naming_format: "{title} - {source_episode_segment}" },
 * }))
 * ```
 */
export function makeTestConfig(
  databasePath: string,
  override?: (encoded: ConfigCoreEncoded) => ConfigCoreEncoded,
): Config {
  const core = makeDefaultConfig(databasePath);
  const encoded = Schema.encodeSync(ConfigCoreSchema)(core);
  const modified = override ? override(encoded) : encoded;
  return composeConfig(Schema.decodeUnknownSync(ConfigCoreSchema)(modified), []);
}
