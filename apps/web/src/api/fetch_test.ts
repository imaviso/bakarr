import { beforeEach, expect, it, vi } from "vitest";
import { Effect, Schema } from "effect";
import { fetchJson, fetchResponse, mergeHeaders } from "./effect/api-client";

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
