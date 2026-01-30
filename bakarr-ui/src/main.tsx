import { render } from "solid-js/web";
import "solid-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createRouter, RouterProvider } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen";
import "@fontsource-variable/geist";
import "./styles.css";
import { getAuthState } from "~/lib/auth";

const queryClient = new QueryClient();

// Set up a Router instance
const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultViewTransition: false,
	defaultPreloadStaleTime: 0,
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

if (rootElement && !rootElement.innerHTML) {
	render(
		() => (
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		),
		rootElement,
	);
}
