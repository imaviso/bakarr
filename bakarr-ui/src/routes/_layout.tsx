import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { AppSidebar } from "~/components/app-sidebar";
import { Breadcrumb } from "~/components/breadcrumb";
import { ModeToggle } from "~/components/mode-toggle";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "~/components/ui/sidebar";
import { useAuth } from "~/lib/auth";

export const Route = createFileRoute("/_layout")({
	beforeLoad: ({ location }) => {
		const { auth } = useAuth();
		if (!auth().isAuthenticated) {
			throw redirect({
				to: "/login",
				search: {
					redirect: location.href,
				},
			});
		}
	},
	component: LayoutComponent,
});

function LayoutComponent() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background/80 backdrop-blur-sm px-4 border-b md:border-b-0">
					<SidebarTrigger class="-ml-1" />
					<div class="h-4 w-px bg-border/50 mx-1 hidden md:block" />
					<Breadcrumb />
					<div class="ml-auto px-3">
						<ModeToggle />
					</div>
				</header>
				<main class="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 min-w-0 overflow-x-hidden">
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
