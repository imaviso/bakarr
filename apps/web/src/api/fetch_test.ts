import { beforeEach, expect, it, vi } from "vitest";
import { Effect, Schema } from "effect";
import {
  ApiUnauthorizedError,
  fetchJson,
  fetchResponse,
  mergeHeaders,
  runApiEffect,
} from "./effect/api-client";

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

function requireRequestInit(value: RequestInit | undefined): RequestInit & { headers: Headers } {
  if (!(value?.headers instanceof Headers)) {
    throw new Error("Expected fetch init with Headers");
  }
  return { ...value, headers: value.headers };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it("mergeHeaders merges auth headers without forcing content type for bodyless requests", () => {
  const headers = mergeHeaders(undefined, { "X-Api-Key": "key-1" });
  expect(headers.get("X-Api-Key")).toBe("key-1");
  expect(headers.get("Content-Type")).toBeNull();
});

it("mergeHeaders preserves explicit content type header", () => {
  const headers = mergeHeaders({ headers: { "Content-Type": "text/plain" } }, {});
  expect(headers.get("Content-Type")).toBe("text/plain");
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
  expect(value.title).toBe("Naruto");
});

it("fetchResponse serializes plain object bodies as JSON", async () => {
  let capturedInit: RequestInit | undefined;
  const fetchMock = vi.fn((_endpoint: string, init?: RequestInit) => {
    capturedInit = init;
    return Promise.resolve(
      createResponse({
        ok: true,
        status: 200,
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  await Effect.runPromise(
    fetchResponse("/api/anime", { body: { title: "Naruto" }, method: "POST" }),
  );

  const init = requireRequestInit(capturedInit);
  expect(init.body).toBe('{"title":"Naruto"}');
  expect(init.method).toBe("POST");
  expect(init.headers.get("Content-Type")).toBe("application/json");
});

it("fetchResponse does not force JSON content type for URLSearchParams bodies", async () => {
  let capturedInit: RequestInit | undefined;
  const fetchMock = vi.fn((_endpoint: string, init?: RequestInit) => {
    capturedInit = init;
    return Promise.resolve(
      createResponse({
        ok: true,
        status: 200,
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const body = new URLSearchParams({ q: "naruto" });

  await Effect.runPromise(fetchResponse("/api/search", { body, method: "POST" }));

  const init = requireRequestInit(capturedInit);
  expect(init.body).toBe(body);
  expect(init.headers.get("Content-Type")).toBeNull();
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
  await expect(Effect.runPromise(fetchJson(schema, "/api/anime/1"))).rejects.toThrow(
    "Schema validation failed",
  );
});

it("fetchResponse returns ApiUnauthorizedError on 401", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(createResponse({ ok: false, status: 401, text: "Unauthorized" }))),
  );

  await expect(Effect.runPromise(fetchResponse("/api/protected"))).rejects.toThrow("Unauthorized");
});

it("runApiEffect rejects with typed API failures", async () => {
  await expect(
    runApiEffect(Effect.fail(new ApiUnauthorizedError({ message: "Unauthorized" }))),
  ).rejects.toBeInstanceOf(ApiUnauthorizedError);
});
