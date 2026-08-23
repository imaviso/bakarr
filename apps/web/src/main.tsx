import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { logout } from "@/app/auth";
import {
  ApiClientError,
  ApiDecodeError,
  ApiUnauthorizedError,
  isApiUnauthorizedError,
} from "@/api/effect/api-client";
import { errorMessage } from "@/api/effect/errors";
// oxlint-disable-next-line import/no-unassigned-import
import "./index.css";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isAbortError(error)) return;
      if (mutation.meta?.["isAuth"]) {
        return;
      }
      if (isApiUnauthorizedError(error)) {
        void logout();
        return;
      }
      if (mutation.meta?.["quiet"]) {
        return;
      }
      toast.error(errorMessage(error, "Something went wrong"));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 1, // 1 minute default
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: (failureCount, error) => {
        if (isAbortError(error)) return false;
        if (failureCount >= 1) return false;
        if (error instanceof ApiUnauthorizedError) return false;
        if (error instanceof ApiDecodeError) return false;
        if (error instanceof ApiClientError) {
          const status = error.status;
          return status === undefined || status >= 500;
        }
        return true;
      },
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
