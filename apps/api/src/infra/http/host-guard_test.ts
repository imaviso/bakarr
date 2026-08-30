import { assert, describe, it } from "@effect/vitest";

import { isAllowedHostHeader } from "@/infra/http/host-guard.ts";

describe("host guard", () => {
  it("allows IP-literal hosts", () => {
    assert.deepStrictEqual(isAllowedHostHeader("192.168.1.10:8000", []), true);
    assert.deepStrictEqual(isAllowedHostHeader("10.0.0.4", []), true);
    assert.deepStrictEqual(isAllowedHostHeader("[::1]:8000", []), true);
    assert.deepStrictEqual(isAllowedHostHeader("[fe80::1]", []), true);
  });

  it("allows localhost variants", () => {
    assert.deepStrictEqual(isAllowedHostHeader("localhost", []), true);
    assert.deepStrictEqual(isAllowedHostHeader("LOCALHOST:8000", []), true);
    assert.deepStrictEqual(isAllowedHostHeader("127.0.0.1:8000", []), true);
  });

  it("allows explicitly trusted hosts regardless of port or case", () => {
    assert.deepStrictEqual(isAllowedHostHeader("server.local:8000", ["server.local"]), true);
    assert.deepStrictEqual(isAllowedHostHeader("SERVER.LOCAL", ["server.local"]), true);
  });

  it("rejects attacker-chosen domain hosts", () => {
    assert.deepStrictEqual(isAllowedHostHeader("attacker.example:8000", []), false);
    assert.deepStrictEqual(isAllowedHostHeader("evil.rebind.attacker.example", []), false);
  });

  it("does not treat a trusted host as a suffix match", () => {
    assert.deepStrictEqual(isAllowedHostHeader("evil-server.local:8000", ["server.local"]), false);
  });

  it("rejects missing or empty host headers", () => {
    assert.deepStrictEqual(isAllowedHostHeader("", []), false);
    assert.deepStrictEqual(isAllowedHostHeader("   ", []), false);
  });
});
