import {
  WarningIcon,
  CalendarIcon,
  TelevisionIcon,
  DownloadIcon,
  HouseIcon,
  ListIcon,
  SignOutIcon,
  RssIcon,
  GearIcon,
} from "@phosphor-icons/react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { CommandPalette } from "~/app/layout/command-palette";
import { ModeToggle } from "~/components/shared/mode-toggle";
import { SectionLabel } from "~/components/shared/section-label";
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
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "~/components/ui/sidebar";
import { useAuth } from "~/app/auth";

const mainItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: HouseIcon,
  },
  {
    title: "Media",
    url: "/media",
    icon: TelevisionIcon,
  },
  {
    title: "RSS Feeds",
    url: "/rss",
    icon: RssIcon,
  },
  {
    title: "Wanted",
    url: "/wanted",
    icon: WarningIcon,
  },
  {
    title: "Calendar",
    url: "/calendar",
    icon: CalendarIcon,
  },
  {
    title: "Downloads",
    url: "/downloads",
    icon: DownloadIcon,
  },
];

const settingsItems = [
  {
    title: "System Logs",
    url: "/logs",
    icon: ListIcon,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: GearIcon,
  },
];

function isActivePath(pathname: string, url: string) {
  if (url === "/") return pathname === "/";
  return pathname.startsWith(url);
}

export function AppSidebar() {
  const { logout } = useAuth();
  const location = useLocation();
  const router = useRouter();
  const { state } = useSidebar();

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Workspace Header */}
      <SidebarHeader className="p-2 group-data-[collapsible=icon]:p-1">
        <div className="flex w-full items-center gap-2 rounded-none px-2 py-1.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-primary font-mono text-xs font-bold text-primary-foreground">
            ▎
          </div>
          {!isCollapsed && (
            <span className="flex-1 truncate text-left font-mono text-sm font-medium text-sidebar-accent-foreground">
              bakarr
              <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-px animate-pulse bg-success align-baseline" />
            </span>
          )}
        </div>
      </SidebarHeader>

      {/* Search */}
      <div className="px-3 pb-1 group-data-[collapsible=icon]:px-1.5">
        <CommandPalette />
      </div>

      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-0">
        {/* Main Navigation */}
        <SidebarGroup className="py-2 group-data-[collapsible=icon]:px-0">
          <SectionLabel className="block px-3 pb-2 group-data-[collapsible=icon]:hidden">
            main
          </SectionLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActivePath(location.pathname, item.url)}
                    className="h-9 transition-colors"
                    onClick={() => router.navigate({ to: item.url })}
                    aria-current={isActivePath(location.pathname, item.url) ? "page" : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Active Downloads Placeholder */}
        {/* <ActiveDownloads /> */}

        {/* Settings Section */}
        <SidebarGroup className="mt-auto py-2 group-data-[collapsible=icon]:px-0">
          <SectionLabel className="block px-3 pb-2 group-data-[collapsible=icon]:hidden">
            system
          </SectionLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActivePath(location.pathname, item.url)}
                    className="h-9 transition-colors"
                    onClick={() => router.navigate({ to: item.url })}
                    aria-current={isActivePath(location.pathname, item.url) ? "page" : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-1">
        <SidebarSeparator className="mx-0 mb-2 group-data-[collapsible=icon]:mx-0" />
        <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <ModeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                void logout();
              }}
              tooltip="Sign out"
              className="h-9 transition-colors"
            >
              <SignOutIcon className="h-4 w-4 shrink-0" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
