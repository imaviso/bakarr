import { beforeEach, expect, it, vi } from "vitest";
import {
  clearAuthState,
  clearServerSession,
  getAuthHeaders,
  getAuthState,
  loginSuccess,
  replaceApiKey,
} from "~/app/auth-state";

beforeEach(() => {
  vi.restoreAllMocks();
  clearAuthState();
});

it("replaceApiKey updates auth headers after regeneration", () => {
  loginSuccess("admin", undefined, false);

  replaceApiKey("  abc123  ");

  expect(getAuthState()).toMatchObject({
    apiKey: "abc123",
    isAuthenticated: true,
    username: "admin",
  });
  expect(getAuthHeaders()).toEqual({ "X-Api-Key": "abc123" });
});

it("replaceApiKey ignores masked API key placeholders", () => {
  loginSuccess("admin", "abc123", false);

  replaceApiKey("************************");

  expect(getAuthState().apiKey).toBeUndefined();
  expect(getAuthHeaders()).toEqual({});
});

it("clearServerSession calls the logout endpoint with credentials", async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);

  await clearServerSession();

  expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
});
