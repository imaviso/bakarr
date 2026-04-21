import { ThemeProvider } from "@/components/theme-provider";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { GlobalSpinner } from "~/components/global-spinner";
import { NotFound } from "~/components/not-found";
import { Toaster } from "~/components/ui/sonner";
import { AuthProvider, type AuthState } from "~/lib/auth";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  getAuthState: () => AuthState;
}>()({
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <AuthProvider>
      <ThemeProvider storageKey="bakarr-ui-theme">
        <GlobalSpinner />
        <Outlet />
        <Toaster />
      </ThemeProvider>
    </AuthProvider>
  );
}
