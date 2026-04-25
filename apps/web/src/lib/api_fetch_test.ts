import { beforeEach, it, vi } from "vitest";
import { Effect, Schema } from "effect";
import { fetchJson, fetchResponse } from "./effect/api-client";

const authState = vi.hoisted(() => ({
  headers: {} as HeadersInit,
  logoutCalls: 0,
}));

vi.mock("~/lib/auth", () => ({
  getAuthHeaders: () => authState.headers,
  logout: () => {
    authState.logoutCalls += 1;
    return Promise.resolve();
  },
}));

interface FetchResponseStub {
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

function createResponse(input: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
}): FetchResponseStub {
  return {
    json: () => Promise.resolve(input.json ?? {}),
    ok: input.ok,
    status: input.status,
    text: () => Promise.resolve(input.text ?? ""),
  };
}

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function getFetchInit(firstCall: unknown[] | undefined): RequestInit {
  if (!firstCall) {
    throw new Error("Expected fetch to be called");
  }

  const init = firstCall[1];
  if (typeof init !== "object" || init === null) {
    throw new Error("Expected fetch init options");
  }

  return init;
}

beforeEach(() => {
  authState.headers = {};
  authState.logoutCalls = 0;
});

it("fetchResponse merges auth headers without forcing content type for bodyless requests", async () => {
  const fetchMock = vi.fn(() =>
    Promise.resolve(createResponse({ ok: true, status: 200, json: { id: 1 } })),
  );
  vi.stubGlobal("fetch", fetchMock);

  authState.headers = { "X-Api-Key": "key-1" };

  await Effect.runPromise(fetchResponse("/api/anime"));

  const init = getFetchInit(fetchMock.mock.calls[0]);
  const headers = new Headers(init.headers);
  assertEquals(headers.get("X-Api-Key"), "key-1");
  assertEquals(headers.get("Content-Type"), null);
});

it("fetchResponse sets JSON content type when request body is present", async () => {
  const fetchMock = vi.fn(() =>
    Promise.resolve(createResponse({ ok: true, status: 200, json: { id: 1 } })),
  );
  vi.stubGlobal("fetch", fetchMock);

  await Effect.runPromise(
    fetchResponse("/api/anime", {
      body: JSON.stringify({ id: 1 }),
      method: "POST",
    }),
  );

  const init = getFetchInit(fetchMock.mock.calls[0]);
  const headers = new Headers(init.headers);
  assertEquals(headers.get("Content-Type"), "application/json");
});

it("fetchResponse preserves explicit content type header", async () => {
  const fetchMock = vi.fn(() =>
    Promise.resolve(createResponse({ ok: true, status: 200, json: { ok: true } })),
  );
  vi.stubGlobal("fetch", fetchMock);

  await Effect.runPromise(
    fetchResponse("/api/custom", {
      headers: {
        "Content-Type": "text/plain",
      },
    }),
  );

  const init = getFetchInit(fetchMock.mock.calls[0]);
  const headers = new Headers(init.headers);
  assertEquals(headers.get("Content-Type"), "text/plain");
});

it("fetchJson decodes response with schema", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        createResponse({
          ok: true,
          status: 200,
          json: { title: "Naruto" },
        }),
      ),
    ),
  );

  const schema = Schema.Struct({ title: Schema.String });
  const value = await Effect.runPromise(fetchJson(schema, "/api/anime/1"));
  assertEquals(value.title, "Naruto");
});

it("fetchJson rejects on schema mismatch", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        createResponse({
          ok: true,
          status: 200,
          json: { title: 123 },
        }),
      ),
    ),
  );

  const schema = Schema.Struct({ title: Schema.String });
  await Effect.runPromise(fetchJson(schema, "/api/anime/1"))
    .then(() => {
      throw new Error("Expected fetchJson to reject");
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assertEquals(message.includes("Schema validation failed"), true);
    });
});

it("fetchResponse returns ApiUnauthorizedError on 401", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(createResponse({ ok: false, status: 401, text: "Unauthorized" }))),
  );

  await Effect.runPromise(fetchResponse("/api/protected"))
    .then(() => {
      throw new Error("Expected fetchResponse to reject");
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assertEquals(message, "Session expired");
    });
});

it("fetchResponse can skip auto-logout on unauthorized", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(createResponse({ ok: false, status: 401, text: "Unauthorized" }))),
  );

  await Effect.runPromise(fetchResponse("/api/protected", { skipAutoLogoutOnUnauthorized: true }))
    .then(() => {
      throw new Error("Expected fetchResponse to reject");
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assertEquals(message, "Unauthorized");
    });

  assertEquals(authState.logoutCalls, 0);
});
