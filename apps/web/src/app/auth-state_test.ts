import { beforeEach, expect, it, vi } from "vitest";
import {
  clearAuthState,
  clearServerSession,
  getAuthHeaders,
  getAuthState,
  loginSuccess,
  replaceApiKey,
} from "@/app/auth-state";

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

it("replaceApiKey stores the regenerated key verbatim", () => {
  loginSuccess("admin", "abc123", false);

  replaceApiKey("def456");

  expect(getAuthState().apiKey).toBe("def456");
  expect(getAuthHeaders()).toEqual({ "X-Api-Key": "def456" });
});

it("clearServerSession calls the logout endpoint with credentials", async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);

  await clearServerSession();

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/auth/logout",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
    }),
  );
});
