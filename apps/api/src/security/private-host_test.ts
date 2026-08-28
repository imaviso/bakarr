import { assert, describe, it } from "@effect/vitest";

import {
  hostnameIsPrivate,
  httpUrlTargetsPrivateHost,
  isPrivateIpString,
} from "@/security/private-host.ts";

describe("private-host IPv4 ranges", () => {
  it("flags every private/reserved IPv4 range", () => {
    assert.deepStrictEqual(isPrivateIpString("0.0.0.0"), true);
    assert.deepStrictEqual(isPrivateIpString("0.255.255.255"), true);
    assert.deepStrictEqual(isPrivateIpString("10.0.0.0"), true);
    assert.deepStrictEqual(isPrivateIpString("10.1.2.3"), true);
    assert.deepStrictEqual(isPrivateIpString("100.64.0.1"), true);
    assert.deepStrictEqual(isPrivateIpString("100.127.255.255"), true);
    assert.deepStrictEqual(isPrivateIpString("127.0.0.1"), true);
    assert.deepStrictEqual(isPrivateIpString("169.254.1.1"), true);
    assert.deepStrictEqual(isPrivateIpString("172.16.0.1"), true);
    assert.deepStrictEqual(isPrivateIpString("172.31.255.255"), true);
    assert.deepStrictEqual(isPrivateIpString("192.168.1.10"), true);
    assert.deepStrictEqual(isPrivateIpString("198.18.0.1"), true);
    assert.deepStrictEqual(isPrivateIpString("198.19.255.255"), true);
  });

  it("does not over-block range boundaries", () => {
    assert.deepStrictEqual(isPrivateIpString("1.0.0.1"), false);
    assert.deepStrictEqual(isPrivateIpString("9.255.255.255"), false);
    assert.deepStrictEqual(isPrivateIpString("11.0.0.1"), false);
    assert.deepStrictEqual(isPrivateIpString("100.63.255.255"), false);
    assert.deepStrictEqual(isPrivateIpString("100.128.0.0"), false);
    assert.deepStrictEqual(isPrivateIpString("126.255.255.255"), false);
    assert.deepStrictEqual(isPrivateIpString("128.0.0.1"), false);
    assert.deepStrictEqual(isPrivateIpString("172.15.255.255"), false);
    assert.deepStrictEqual(isPrivateIpString("172.32.0.0"), false);
    assert.deepStrictEqual(isPrivateIpString("192.169.0.0"), false);
    assert.deepStrictEqual(isPrivateIpString("198.17.255.255"), false);
    assert.deepStrictEqual(isPrivateIpString("198.20.0.0"), false);
  });

  it("flags public IPv4 as public", () => {
    assert.deepStrictEqual(isPrivateIpString("8.8.8.8"), false);
    assert.deepStrictEqual(isPrivateIpString("93.184.216.34"), false);
  });
});

describe("private-host IPv6", () => {
  it("flags loopback, unspecified, and ULA/link-local", () => {
    assert.deepStrictEqual(isPrivateIpString("::1"), true);
    assert.deepStrictEqual(isPrivateIpString("::"), true);
    assert.deepStrictEqual(isPrivateIpString("fc00::1"), true);
    assert.deepStrictEqual(isPrivateIpString("fd12:3456:789a::1"), true);
    assert.deepStrictEqual(isPrivateIpString("fe80::1"), true);
    assert.deepStrictEqual(isPrivateIpString("febf::ffff"), true);
  });

  it("does not over-block public IPv6", () => {
    assert.deepStrictEqual(isPrivateIpString("2606:4700::1111"), false);
    assert.deepStrictEqual(isPrivateIpString("2001:db8::1"), false);
    assert.deepStrictEqual(isPrivateIpString("fb00::1"), false);
    assert.deepStrictEqual(isPrivateIpString("fec0::1"), false);
  });

  it("re-checks IPv4-mapped addresses against IPv4 ranges", () => {
    assert.deepStrictEqual(isPrivateIpString("::ffff:10.0.0.1"), true);
    assert.deepStrictEqual(isPrivateIpString("::ffff:127.0.0.1"), true);
    assert.deepStrictEqual(isPrivateIpString("::ffff:192.168.1.1"), true);
    assert.deepStrictEqual(isPrivateIpString("::ffff:8.8.8.8"), false);
  });
});

describe("private-host input handling", () => {
  it("treats malformed input as not private", () => {
    assert.deepStrictEqual(isPrivateIpString("not-an-ip"), false);
    assert.deepStrictEqual(isPrivateIpString(""), false);
    assert.deepStrictEqual(isPrivateIpString("999.1.1.1"), false);
    assert.deepStrictEqual(isPrivateIpString("10.0.0"), false);
    assert.deepStrictEqual(isPrivateIpString("10.0.0.0.0"), false);
  });

  it("rejects liberal IPv4 encodings that map to loopback", () => {
    // `isIP` rejects these; callers must not treat them as parsed literals.
    assert.deepStrictEqual(isPrivateIpString("0x7f.0.0.1"), false);
    assert.deepStrictEqual(isPrivateIpString("2130706433"), false);
    assert.deepStrictEqual(isPrivateIpString("0177.0.0.1"), false);
  });
});

describe("hostnameIsPrivate", () => {
  it("flags loopback hostname variants", () => {
    assert.deepStrictEqual(hostnameIsPrivate("localhost"), true);
    assert.deepStrictEqual(hostnameIsPrivate("LOCALHOST"), true);
    assert.deepStrictEqual(hostnameIsPrivate("ip6-localhost"), true);
    assert.deepStrictEqual(hostnameIsPrivate("ip6-loopback"), true);
    assert.deepStrictEqual(hostnameIsPrivate("foo.localhost"), true);
  });

  it("flags IP literals including bracketed IPv6", () => {
    assert.deepStrictEqual(hostnameIsPrivate("127.0.0.1"), true);
    assert.deepStrictEqual(hostnameIsPrivate("10.0.0.5"), true);
    assert.deepStrictEqual(hostnameIsPrivate("[::1]"), true);
    assert.deepStrictEqual(hostnameIsPrivate("fe80::1"), true);
  });

  it("allows public hostnames and IPs", () => {
    assert.deepStrictEqual(hostnameIsPrivate("nyaa.si"), false);
    assert.deepStrictEqual(hostnameIsPrivate("example.com."), false);
    assert.deepStrictEqual(hostnameIsPrivate("8.8.8.8"), false);
  });
});

describe("httpUrlTargetsPrivateHost", () => {
  it("flags URLs targeting private hosts", () => {
    assert.deepStrictEqual(httpUrlTargetsPrivateHost("http://127.0.0.1:8080/feed.xml"), true);
    assert.deepStrictEqual(httpUrlTargetsPrivateHost("http://localhost/feed.xml"), true);
    assert.deepStrictEqual(httpUrlTargetsPrivateHost("http://[::1]/feed.xml"), true);
    assert.deepStrictEqual(httpUrlTargetsPrivateHost("http://10.0.0.1/feed.xml"), true);
  });

  it("allows public URLs and survives malformed input", () => {
    assert.deepStrictEqual(httpUrlTargetsPrivateHost("https://nyaa.si/feed.xml"), false);
    assert.deepStrictEqual(httpUrlTargetsPrivateHost("not a url"), false);
  });
});
