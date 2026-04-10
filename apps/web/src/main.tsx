import { render } from "solid-js/web";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createRouter, RouterProvider } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen";
// oxlint-disable-next-line import/no-unassigned-import
import "@fontsource-variable/geist";
// oxlint-disable-next-line import/no-unassigned-import
import "./styles.css";
import { getAuthState, syncAuthenticatedUser } from "~/lib/auth";
import { API_BASE, fetchApiResponse } from "~/lib/api/client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 1, // 1 minute default
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 1,
      refetchOnWindowFocus: true,
      networkMode: "always", // Ideal for local/self-hosted apps
    },
    mutations: {
      networkMode: "always",
    },
  },
});

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultViewTransition: false,
  defaultPreloadStaleTime: 1000 * 30,
  context: {
    queryClient,
    getAuthState,
  },
});
declare module "@tanstack/solid-router" {
  interface Register {
    // This infers the type of our router and registers it across your entire project
    router: typeof router;
  }
}
const rootElement = document.getElementById("app");

void bootstrap();

async function bootstrap() {
  await hydrateSessionState();

  if (!rootElement || rootElement.innerHTML) {
    return;
  }

  render(
    () => (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
    rootElement,
  );
}

async function hydrateSessionState() {
  const response = await fetchApiResponse(`${API_BASE}/auth/me`, {
    skipAutoLogoutOnUnauthorized: true,
  }).catch(() => undefined);

  if (!response || response.status === 401 || !response.ok) {
    return;
  }

  const raw = await response.json();

  if (
    typeof raw === "object" &&
    raw !== null &&
    "username" in raw &&
    typeof raw.username === "string" &&
    raw.username.length > 0
  ) {
    syncAuthenticatedUser(raw.username);
  }
}
