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
    title: "Anime",
    url: "/anime",
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
        <div className="flex items-center gap-2 w-full rounded-none px-2 py-1.5">
          <div className="flex h-6 w-6 items-center justify-center bg-primary text-primary-foreground font-semibold text-xs shrink-0 rounded-none">
            B
          </div>
          {!isCollapsed && (
            <span className="font-semibold text-sm text-sidebar-accent-foreground truncate flex-1 text-left">
              Bakarr
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
          <div className="px-3 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-widest group-data-[collapsible=icon]:hidden">
            MAIN
          </div>
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
        <SidebarGroup className="py-2 mt-auto group-data-[collapsible=icon]:px-0">
          <div className="px-3 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-widest group-data-[collapsible=icon]:hidden">
            SYSTEM
          </div>
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
        <SidebarSeparator className="mb-2 mx-0 group-data-[collapsible=icon]:mx-0 bg-border" />
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
