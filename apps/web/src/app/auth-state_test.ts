import { beforeEach, expect, it, vi } from "vitest";
import { clearServerSession } from "~/app/auth-state";

beforeEach(() => {
  vi.restoreAllMocks();
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
