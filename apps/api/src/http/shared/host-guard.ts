import { isIP } from "node:net";

/**
 * DNS-rebinding guard: decide whether a request's Host header may be served.
 *
 * SameSite=Lax keeps the session cookie off cross-site requests, but a
 * rebounding attacker domain (resolving to this host's LAN IP) is same-site,
 * so cookies flow and the whole API becomes reachable. Such attacks always
 * arrive with an attacker-chosen *domain* Host header — never an IP literal —
 * so the guard accepts only:
 *
 * - IP-literal hosts (`192.168.1.10`, `[::1]`)
 * - `localhost` / `127.0.0.1` variants
 * - hosts explicitly listed in `BAKARR_TRUSTED_HOSTS` (for access via mDNS or
 *   DNS names such as `server.local`)
 */
export function isAllowedHostHeader(hostHeader: string, trustedHosts: ReadonlyArray<string>) {
  const hostname = normalizeHost(hostHeader);

  if (hostname.length === 0) {
    return false;
  }

  if (isIpLiteral(hostname) || LOCAL_HOSTNAMES.has(hostname)) {
    return true;
  }

  return trustedHosts.map(normalizeHost).includes(hostname);
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHost(hostHeader: string) {
  const withoutPort = stripPort(hostHeader.trim().toLowerCase());
  // Strip brackets, trailing dot (DNS allows `example.com.`), then lower.
  return withoutPort.replace(/^\[([^\]]+)\]$/, "$1").replace(/\.$/, "");
}

function stripPort(host: string) {
  if (host.startsWith("[")) {
    const closeIndex = host.indexOf("]");
    return closeIndex === -1 ? host : host.slice(0, closeIndex + 1);
  }
  // Bare IPv6 without brackets must not be treated as host:port — it
  // contains multiple colons and never appears as a Host header literal
  // (RFC 3986 requires brackets), but guard against truncation.
  if (host.indexOf(":") !== host.lastIndexOf(":")) {
    return host;
  }
  const colonIndex = host.lastIndexOf(":");
  return colonIndex === -1 ? host : host.slice(0, colonIndex);
}

function isIpLiteral(hostname: string) {
  return isIP(hostname) !== 0;
}
