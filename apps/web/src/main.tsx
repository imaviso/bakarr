import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { logout } from "~/app/auth";
// oxlint-disable-next-line import/no-unassigned-import
import "./index.css";

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
      onError: (error) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "_tag" in error &&
          error._tag === "ApiUnauthorizedError"
        ) {
          void logout();
        }
      },
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
  },
});
declare module "@tanstack/react-router" {
  interface Register {
    // This infers the type of our router and registers it across your entire router
    router: typeof router;
  }
}
const rootElement = document.getElementById("root");

bootstrap();

function bootstrap() {
  if (!rootElement || rootElement.innerHTML) {
    return;
  }

  const root = createRoot(rootElement);
  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
