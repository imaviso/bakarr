import {
	IconAlertTriangle,
	IconCalendar,
	IconDeviceTv,
	IconDownload,
	IconHome,
	IconList,
	IconLogout,
	IconRss,
	IconSettings,
} from "@tabler/icons-solidjs";
import { Link, useLocation } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import {
	DropdownMenu,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
	useSidebar,
} from "~/components/ui/sidebar";
import { useAuth } from "~/lib/auth";

const mainItems = [
	{
		title: "Dashboard",
		url: "/",
		icon: IconHome,
	},
	{
		title: "Anime",
		url: "/anime",
		icon: IconDeviceTv,
	},
	{
		title: "RSS Feeds",
		url: "/rss",
		icon: IconRss,
	},
	{
		title: "Wanted",
		url: "/wanted",
		icon: IconAlertTriangle,
	},
	{
		title: "Calendar",
		url: "/calendar",
		icon: IconCalendar,
	},
	{
		title: "Downloads",
		url: "/downloads",
		icon: IconDownload,
	},
];

const settingsItems = [
	{
		title: "System Logs",
		url: "/logs",
		icon: IconList,
	},
	{
		title: "Settings",
		url: "/settings",
		icon: IconSettings,
	},
];

export function AppSidebar() {
	const { logout } = useAuth();
	const location = useLocation();
	const { state } = useSidebar();

	const isCollapsed = () => state() === "collapsed";

	const isActive = (url: string) => {
		if (url === "/") return location().pathname === "/";
		return location().pathname.startsWith(url);
	};

	return (
		<Sidebar collapsible="icon" class="border-r-0">
			{/* Workspace Header */}
			<SidebarHeader class="p-2 group-data-[collapsible=icon]:p-1">
				<DropdownMenu>
					<DropdownMenuTrigger class="flex items-center gap-2 w-full rounded-md px-2 py-1.5 hover:bg-sidebar-accent transition-colors group outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
						<div class="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold text-xs shrink-0">
							B
						</div>
						<Show when={!isCollapsed()}>
							<span class="font-semibold text-sm text-sidebar-accent-foreground truncate flex-1 text-left">
								Bakarr
							</span>
						</Show>
					</DropdownMenuTrigger>
				</DropdownMenu>
			</SidebarHeader>

			<SidebarContent class="px-2 group-data-[collapsible=icon]:px-0">
				{/* Main Navigation */}
				<SidebarGroup class="py-0 group-data-[collapsible=icon]:px-0">
					<SidebarGroupContent>
						<SidebarMenu class="gap-0.5 group-data-[collapsible=icon]:items-center">
							<For each={mainItems}>
								{(item) => {
									return (
										<SidebarMenuItem>
											<Link
												to={item.url}
												class="w-full"
												activeOptions={{
													exact: item.url === "/",
												}}
											>
												<SidebarMenuButton
													tooltip={item.title}
													isActive={isActive(item.url)}
													class="h-8 rounded-md transition-colors"
												>
													<item.icon
														class={`h-4 w-4 shrink-0 ${isActive(item.url) ? "text-sidebar-primary" : ""}`}
													/>
													<span>{item.title}</span>
												</SidebarMenuButton>
											</Link>
										</SidebarMenuItem>
									);
								}}
							</For>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{/* Active Downloads Placeholder */}
				{/* <ActiveDownloads /> */}

				{/* Settings Section */}
				<SidebarGroup class="py-0 mt-auto group-data-[collapsible=icon]:px-0">
					<SidebarGroupContent>
						<SidebarMenu class="gap-0.5 group-data-[collapsible=icon]:items-center">
							<For each={settingsItems}>
								{(item) => {
									return (
										<SidebarMenuItem>
											<Link to={item.url} class="w-full">
												<SidebarMenuButton
													tooltip={item.title}
													isActive={isActive(item.url)}
													class="h-8 rounded-md transition-colors"
												>
													<item.icon
														class={`h-4 w-4 shrink-0 ${isActive(item.url) ? "text-sidebar-primary" : ""}`}
													/>
													<span>{item.title}</span>
												</SidebarMenuButton>
											</Link>
										</SidebarMenuItem>
									);
								}}
							</For>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			{/* Footer */}
			<SidebarFooter class="p-2 group-data-[collapsible=icon]:p-1">
				<SidebarSeparator class="mb-2 mx-0 group-data-[collapsible=icon]:mx-0" />
				<SidebarMenu class="gap-0.5 group-data-[collapsible=icon]:items-center">
					<SidebarMenuItem>
						<SidebarMenuButton
							onClick={() => logout()}
							tooltip="Sign out"
							class="h-8 rounded-md transition-colors"
						>
							<IconLogout class="h-4 w-4 shrink-0" />
							<span>Sign out</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
