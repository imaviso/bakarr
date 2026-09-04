import type { Config } from "@packages/shared/index.ts";
import type { ConfigCore } from "@/features/system/config-codec.ts";
import { Brand, Option } from "effect";

export type NonEmptyPassword = string & Brand.Brand<"NonEmptyPassword">;
export const NonEmptyPassword = Brand.make<NonEmptyPassword>(
  (value) => value.trim().length > 0 || `Expected non-empty password but received "${value}"`,
);

export function toNonEmptyPasswordOption(value: string | null | undefined): Option.Option<string> {
  if (value === null || value === undefined) {
    return Option.none();
  }
  if (value.trim().length === 0) {
    return Option.none();
  }
  const branded = NonEmptyPassword.result(value);
  return branded._tag === "Success" ? Option.some(value) : Option.none();
}

export function applyPasswordPreservation(storedConfig: ConfigCore, nextConfig: Config): Config {
  let result = nextConfig;
  const storedQBitPassword = toNonEmptyPasswordOption(storedConfig.qbittorrent.password);

  if (
    result.qbittorrent.enabled &&
    Option.isNone(toNonEmptyPasswordOption(result.qbittorrent.password)) &&
    Option.isSome(storedQBitPassword)
  ) {
    result = {
      ...result,
      qbittorrent: {
        ...result.qbittorrent,
        password: storedQBitPassword.value,
      },
    };
  }

  if (!result.metadata?.anidb) {
    return result;
  }

  const storedAniDbPassword = toNonEmptyPasswordOption(storedConfig.metadata?.anidb?.password);

  if (
    result.metadata.anidb.enabled &&
    Option.isNone(toNonEmptyPasswordOption(result.metadata.anidb.password)) &&
    Option.isSome(storedAniDbPassword)
  ) {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        anidb: {
          ...result.metadata.anidb,
          password: storedAniDbPassword.value,
        },
      },
    };
  }

  return result;
}

export function validateCorruptStatePasswords(
  nextConfig: Config,
): Option.Option<{ readonly field: "qbittorrent" | "anidb"; readonly message: string }> {
  if (
    nextConfig.qbittorrent.enabled &&
    Option.isNone(toNonEmptyPasswordOption(nextConfig.qbittorrent.password))
  ) {
    return Option.some({
      field: "qbittorrent",
      message:
        "Stored configuration is corrupt. Re-enter the qBittorrent password before saving repaired config.",
    });
  }

  if (
    nextConfig.metadata?.anidb.enabled &&
    Option.isNone(toNonEmptyPasswordOption(nextConfig.metadata.anidb.password))
  ) {
    return Option.some({
      field: "anidb",
      message:
        "Stored configuration is corrupt. Re-enter the AniDB password before saving repaired config.",
    });
  }

  return Option.none();
}
