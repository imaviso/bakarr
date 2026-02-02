import {
	ColorModeProvider,
	ColorModeScript,
	createLocalStorageManager,
} from "@kobalte/core";
import type { QueryClient } from "@tanstack/solid-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/solid-router";
import { lazy, Show } from "solid-js";
import { GlobalSpinner } from "~/components/global-spinner";
import { NotFound } from "~/components/not-found";
import { SseToastListener } from "~/components/sse-toast-listener";
import { Toaster } from "~/components/ui/sonner";
import { AuthProvider, type AuthState } from "~/lib/auth";

const TanStackRouterDevtools =
	import.meta.env.PROD
		? () => null // Render nothing in production
		: lazy(() =>
				import("@tanstack/solid-router-devtools").then((res) => ({
					default: res.TanStackRouterDevtools,
				})),
			);

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
	getAuthState: () => AuthState;
}>()({
	component: RootComponent,
	notFoundComponent: NotFound,
});

function RootComponent() {
	const storageManager = createLocalStorageManager("bakarr-ui-theme");
	return (
		<AuthProvider>
			<ColorModeScript storageType={storageManager.type} />
			<ColorModeProvider storageManager={storageManager}>
				<GlobalSpinner />
				<Outlet />
				<TanStackRouterDevtools position="bottom-right" />
				<SseToastListener />
				<Toaster />
			</ColorModeProvider>
		</AuthProvider>
	);
}
