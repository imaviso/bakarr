import { Cause, Effect, Exit } from "effect";

import { assert, it } from "@effect/vitest";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { normalizeConfig } from "@/features/system/config-codec.ts";

it("normalizes rTorrent SCGI TCP URLs", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        trusted_local: true,
        url: "SCGI://LOCALHOST:5000/",
      },
    }));

    const normalized = yield* normalizeConfig(config);

    assert.deepStrictEqual(normalized.rtorrent.url, "scgi://localhost:5000");
    assert.deepStrictEqual(normalized.rtorrent.trusted_local, true);
  }));

it("normalizes rTorrent unix socket URLs", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "scgi:///home/user/rtorrent/rpc.socket/",
      },
    }));

    const normalized = yield* normalizeConfig(config);

    assert.deepStrictEqual(normalized.rtorrent.url, "scgi:///home/user/rtorrent/rpc.socket");
  }));

it("keeps proxied http(s) rTorrent URLs", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "https://rpc.example.com/RPC2",
      },
    }));

    const normalized = yield* normalizeConfig(config);

    assert.deepStrictEqual(normalized.rtorrent.url, "https://rpc.example.com/RPC2");
  }));

it("rejects unsupported rTorrent URL schemes", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "ftp://localhost:5000",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /must use scgi/);
      }
    }
  }));

it("rejects SCGI TCP URLs without a port", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "scgi://localhost",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.match(failure.value.message, /must include a port/);
      }
    }
  }));

it("rejects SCGI TCP URLs with a path", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "scgi://localhost:5000/RPC2",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.match(failure.value.message, /must not include a path/);
      }
    }
  }));

it("rejects SCGI URLs with credentials", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "scgi://user:pass@localhost:5000",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.match(failure.value.message, /must not include credentials/);
      }
    }
  }));

it("rejects empty SCGI unix socket paths", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "scgi:///",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.match(failure.value.message, /socket path must not be empty/);
      }
    }
  }));

it("rejects private rTorrent SCGI hosts when trusted_local is disabled", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        trusted_local: false,
        url: "scgi://127.0.0.1:5000",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /trusted_local/);
      }
    }
  }));

it("rejects proxied private rTorrent hosts when trusted_local is disabled", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        trusted_local: false,
        url: "http://127.0.0.1:8080/RPC2",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /trusted_local/);
      }
    }
  }));

it("rejects http(s) rTorrent URLs with credentials", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      rtorrent: {
        ...value.rtorrent,
        url: "https://demo:secret@rpc.example.com/RPC2",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value.message, "rTorrent URL must not include credentials");
      }
    }
  }));
