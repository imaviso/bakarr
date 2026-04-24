import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Effect, Schema } from "effect";
// oxlint-disable-next-line import/no-unassigned-import
import "./index.css";
import { getAuthState } from "~/lib/auth";
import { API_BASE } from "~/lib/api";
import { fetchJson } from "~/lib/effect/api-client";
import { AuthService } from "~/lib/effect/auth-service";
import { appRuntime } from "~/lib/runtime";

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
declare module "@tanstack/react-router" {
  interface Register {
    // This infers the type of our router and registers it across your entire router
    router: typeof router;
  }
}
const rootElement = document.getElementById("root");

void bootstrap();

async function bootstrap() {
  if (!rootElement || rootElement.innerHTML) {
    return;
  }

  await hydrateSessionState();

  const root = createRoot(rootElement);
  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const AuthMeSchema = Schema.Struct({
  username: Schema.String.pipe(Schema.minLength(1)),
});

async function hydrateSessionState() {
  const program = fetchJson(AuthMeSchema, `${API_BASE}/auth/me`, {
    skipAutoLogoutOnUnauthorized: true,
  }).pipe(
    Effect.flatMap((decoded) =>
      Effect.gen(function* () {
        const auth = yield* AuthService;
        yield* auth.syncAuthenticatedUser(decoded.username);
      }),
    ),
    Effect.catchAll(() => Effect.void),
  );

  await appRuntime.runPromise(program).catch(() => {
    // Ignore hydration errors
  });
}
