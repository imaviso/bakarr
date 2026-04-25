import { useIsFetching } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Effect, Either } from "effect";
import { Suspense, lazy } from "react";
import { AppSidebar } from "~/app/layout/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { syncAuthenticatedUser } from "~/app/auth";
import { authMeQueryOptions } from "~/api/auth";
import { ApiUnauthorizedError } from "~/api/effect/api-client";

const SocketToastListenerLazy = lazy(() =>
  import("~/components/shared/socket-toast-listener").then((module) => ({
    default: module.SocketToastListener,
  })),
);

export const Route = createFileRoute("/_layout")({
  beforeLoad: async ({ context, location }) => {
    const result = await Effect.runPromise(
      Effect.either(
        Effect.tryPromise({
          try: () => context.queryClient.fetchQuery(authMeQueryOptions()),
          catch: (error) => error,
        }),
      ),
    );

    if (Either.isRight(result)) {
      const user = result.right;
      syncAuthenticatedUser(user.username);
      return;
    }

    if (result.left instanceof ApiUnauthorizedError) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }

    throw result.left;
  },
  component: LayoutComponent,
});

function LayoutComponent() {
  const isFetching = useIsFetching();

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="h-0.5 w-full bg-transparent overflow-hidden fixed top-0 left-0 z-[100] pointer-events-none">
          {isFetching > 0 && (
            <div className="h-full bg-primary animate-progress-indeterminate w-full origin-left" />
          )}
        </div>
        {/* Mobile-only sidebar trigger */}
        <div className="sticky top-0 z-10 flex h-12 items-center px-4 md:hidden">
          <SidebarTrigger />
        </div>
        <main
          id="main-content"
          className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 min-w-0 min-h-0 overflow-hidden"
        >
          <Outlet />
        </main>
        <Suspense fallback={null}>
          <SocketToastListenerLazy />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
