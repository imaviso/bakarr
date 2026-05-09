import {
  ArrowClockwiseIcon,
  GearIcon,
  KeyIcon,
  ListChecksIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import type { ComponentType } from "react";
import { AccountSettingsForm } from "~/features/settings/account-settings-form";
import { QualityProfilesTab } from "~/features/settings/quality-profiles-tab";
import { ReleaseProfilesTab } from "~/features/settings/release-profiles-tab";
import { GeneralSettingsForm } from "~/features/settings/system-settings-form";
import { GeneralError } from "~/components/shared/general-error";
import { PageHeader } from "~/app/layout/page-header";
import { PageShell } from "~/app/layout/page-shell";
import { SectionLabel } from "~/components/shared/section-label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  profilesQueryOptions,
  qualitiesQueryOptions,
  releaseProfilesQueryOptions,
} from "~/api/profiles";
import { systemConfigQueryOptions } from "~/api/system-config";
import { usePageTitle } from "~/domain/page-title";
import { cn } from "~/infra/utils";

const SettingsTabSchema = Schema.transform(
  Schema.String,
  Schema.Literal("general", "automation", "profiles", "release-profiles", "account"),
  {
    decode: (s) => {
      switch (s) {
        case "general":
        case "automation":
        case "profiles":
        case "release-profiles":
        case "account":
          return s;
        default:
          return "general";
      }
    },
    encode: (s) => s,
  },
);

const SettingsSearchSchema = Schema.Struct({
  tab: Schema.optional(SettingsTabSchema),
});

interface NavItem {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const SETTINGS_GROUPS: NavGroup[] = [
  {
    label: "System",
    items: [
      { value: "general", label: "General", icon: GearIcon },
      { value: "automation", label: "Automation", icon: ArrowClockwiseIcon },
    ],
  },
  {
    label: "Profiles",
    items: [
      { value: "profiles", label: "Quality Profiles", icon: SlidersHorizontalIcon },
      { value: "release-profiles", label: "Release Profiles", icon: ListChecksIcon },
    ],
  },
  {
    label: "Account",
    items: [{ value: "account", label: "Account", icon: KeyIcon }],
  },
];

const ALL_ITEMS = SETTINGS_GROUPS.flatMap((g) => g.items);

export const Route = createFileRoute("/_layout/settings")({
  validateSearch: Schema.standardSchemaV1(SettingsSearchSchema),
  loaderDeps: ({ search }) => ({ tab: search.tab ?? "general" }),
  loader: async ({ context: { queryClient }, deps }) => {
    switch (deps.tab) {
      case "general":
      case "automation":
        await queryClient.ensureQueryData(systemConfigQueryOptions());
        return;
      case "profiles":
        await Promise.all([
          queryClient.ensureQueryData(profilesQueryOptions()),
          queryClient.ensureQueryData(qualitiesQueryOptions()),
        ]);
        return;
      case "release-profiles":
        await queryClient.ensureQueryData(releaseProfilesQueryOptions());
        return;
      case "account":
        return;
    }
  },
  component: SettingsPage,
  errorComponent: GeneralError,
});

function SettingsNav({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string | null) => void;
}) {
  return (
    <nav role="tablist" className="hidden md:flex flex-col gap-6 w-44 shrink-0">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <SectionLabel className="px-3">{group.label}</SectionLabel>
          {group.items.map((item) => (
            <button
              key={item.value}
              id={`tab-${item.value}`}
              role="tab"
              aria-selected={activeTab === item.value}
              aria-controls={`panel-${item.value}`}
              onClick={() => onTabChange(item.value)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const currentIndex = ALL_ITEMS.findIndex((i) => i.value === item.value);
                const nextIndex =
                  e.key === "ArrowRight"
                    ? (currentIndex + 1) % ALL_ITEMS.length
                    : (currentIndex - 1 + ALL_ITEMS.length) % ALL_ITEMS.length;
                const nextItem = ALL_ITEMS[nextIndex];
                if (nextItem) {
                  onTabChange(nextItem.value);
                  document.getElementById(`tab-${nextItem.value}`)?.focus();
                }
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors text-left",
                activeTab === item.value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SettingsMobileSelect({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string | null) => void;
}) {
  const activeItem = ALL_ITEMS.find((t) => t.value === activeTab);

  return (
    <div className="md:hidden">
      <Select value={activeTab} onValueChange={onTabChange}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {activeItem && (
              <span className="flex items-center gap-2">
                <activeItem.icon className="h-4 w-4 shrink-0" />
                {activeItem.label}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SETTINGS_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SettingsPage() {
  usePageTitle("Settings");
  const search = Route.useSearch();
  const navigate = useNavigate();
  const activeTab = search.tab ?? "general";

  const handleTabChange = (tab: string | null) => {
    if (!tab) return;
    void navigate({
      to: ".",
      search: { tab },
      replace: true,
    });
  };

  return (
    <PageShell scroll="inner">
      <PageHeader title="Settings" />

      <div className="flex min-h-0 flex-1 gap-6">
        <SettingsNav activeTab={activeTab} onTabChange={handleTabChange} />
        <SettingsMobileSelect activeTab={activeTab} onTabChange={handleTabChange} />

        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="max-w-3xl pb-12">
            {activeTab === "general" && (
              <div
                role="tabpanel"
                id="panel-general"
                aria-labelledby="tab-general"
                className="space-y-6"
              >
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-mono text-sm font-medium tracking-tight">General Settings</h2>
                  <p className="text-xs text-muted-foreground">
                    Core application, library, and naming settings
                  </p>
                </div>
                <GeneralSettingsForm mode="general" />
              </div>
            )}

            {activeTab === "automation" && (
              <div
                role="tabpanel"
                id="panel-automation"
                aria-labelledby="tab-automation"
                className="space-y-6"
              >
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-mono text-sm font-medium tracking-tight">Automation</h2>
                  <p className="text-xs text-muted-foreground">
                    Search, qBittorrent, scheduling, and app-wide release defaults
                  </p>
                </div>
                <GeneralSettingsForm mode="automation" />
              </div>
            )}

            {activeTab === "profiles" && (
              <div role="tabpanel" id="panel-profiles" aria-labelledby="tab-profiles">
                <QualityProfilesTab />
              </div>
            )}

            {activeTab === "release-profiles" && (
              <div
                role="tabpanel"
                id="panel-release-profiles"
                aria-labelledby="tab-release-profiles"
              >
                <ReleaseProfilesTab />
              </div>
            )}

            {activeTab === "account" && (
              <div
                role="tabpanel"
                id="panel-account"
                aria-labelledby="tab-account"
                className="space-y-6"
              >
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-mono text-sm font-medium tracking-tight">Account</h2>
                  <p className="text-xs text-muted-foreground">
                    Manage your password, API access, and notification preferences
                  </p>
                </div>
                <AccountSettingsForm />
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
