import type { Config } from "@packages/shared/index.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";
import { hostnameIsPrivate } from "@/security/private-host.ts";
import { parseUrlEffect } from "@/infra/url.ts";
import { Effect } from "effect";

const configValidationError = (message: string) => new ConfigValidationError({ message });

/**
 * rTorrent exposes XML-RPC over SCGI. Three transports are supported:
 *
 * - `scgi://host:port` — direct TCP (must stay loopback/private; rTorrent RPC
 *   is shell-equivalent, see the rTorrent RPC wiki).
 * - `scgi:///absolute/path.sock` — unix domain socket.
 * - `http(s)://host[:port][/path]` — reverse-proxied SCGI endpoint (nginx
 *   `scgi_pass`, Apache `ProxyPass ... scgi://`) with its own auth.
 */
export const normalizeRtorrentConfig = Effect.fn("SystemConfig.normalizeRtorrentConfig")(function* (
  config: Config["rtorrent"],
) {
  const raw = config.url.trim();
  const lower = raw.toLowerCase();

  if (lower.startsWith("scgi://")) {
    const target = raw.slice("scgi://".length);
    const trustedLocal = config.trusted_local ?? true;

    if (target.startsWith("/")) {
      const path = target.replace(/\/+$/, "");

      if (path.length === 0) {
        return yield* configValidationError("rTorrent SCGI unix socket path must not be empty");
      }

      return {
        ...config,
        trusted_local: trustedLocal,
        url: `scgi://${path}`,
      } satisfies Config["rtorrent"];
    }

    const normalizedUrl = yield* normalizeScgiTcpTarget(target);
    const host = new URL(`dummy://${normalizedUrl.slice("scgi://".length)}`).hostname;

    if (!trustedLocal && hostnameIsPrivate(host)) {
      return yield* new ConfigValidationError({
        message:
          "rTorrent SCGI URL must not target loopback, private, or link-local hosts unless trusted_local is enabled",
      });
    }

    return {
      ...config,
      trusted_local: trustedLocal,
      url: normalizedUrl,
    } satisfies Config["rtorrent"];
  }

  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    const parsed = yield* parseUrlEffect(
      raw,
      (cause) =>
        new ConfigValidationError({
          cause,
          message: "rTorrent URL is invalid",
        }),
    );

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return yield* configValidationError("rTorrent URL must use http, https, or scgi");
    }

    if (parsed.username || parsed.password) {
      return yield* configValidationError("rTorrent URL must not include credentials");
    }

    if (parsed.search || parsed.hash) {
      return yield* configValidationError("rTorrent URL must not include query or fragment");
    }

    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    const normalizedUrl = `${parsed.origin}${pathname}`;
    const trustedLocal = config.trusted_local ?? true;
    const host = new URL(normalizedUrl).hostname;

    if (!trustedLocal && hostnameIsPrivate(host)) {
      return yield* new ConfigValidationError({
        message:
          "rTorrent URL must not target loopback, private, or link-local hosts unless trusted_local is enabled",
      });
    }

    return {
      ...config,
      trusted_local: trustedLocal,
      url: normalizedUrl,
    } satisfies Config["rtorrent"];
  }

  return yield* configValidationError(
    "rTorrent URL must use scgi:// (host:port or /unix/socket) or http(s)://",
  );
});

const normalizeScgiTcpTarget = Effect.fn("SystemConfig.normalizeScgiTcpTarget")(function* (
  target: string,
) {
  if (target.startsWith("/")) {
    const path = target.replace(/\/+$/, "");

    if (path.length === 0) {
      return yield* configValidationError("rTorrent SCGI unix socket path must not be empty");
    }

    return `scgi://${path}`;
  }

  const parsed = yield* parseUrlEffect(
    `dummy://${target}`,
    (cause) =>
      new ConfigValidationError({
        cause,
        message: "rTorrent SCGI URL is invalid (expected scgi://host:port or scgi:///path)",
      }),
  );

  if (parsed.username || parsed.password) {
    return yield* configValidationError("rTorrent URL must not include credentials");
  }

  if (parsed.pathname && parsed.pathname !== "/") {
    return yield* configValidationError(
      "rTorrent SCGI TCP URL must not include a path (use scgi://host:port)",
    );
  }

  if (!parsed.port) {
    return yield* configValidationError("rTorrent SCGI TCP URL must include a port");
  }

  return `scgi://${parsed.hostname}:${parsed.port}`;
});
