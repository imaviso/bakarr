import {
  SlidersHorizontalIcon,
  KeyIcon,
  ListChecksIcon,
  ArrowClockwiseIcon,
  GearIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  profilesQueryOptions,
  qualitiesQueryOptions,
  releaseProfilesQueryOptions,
  systemConfigQueryOptions,
} from "~/lib/api";
import { usePageTitle } from "~/lib/page-title";

const AccountSettingsFormLazy = lazy(() =>
  import("~/components/settings/account-settings-form").then((module) => ({
    default: module.AccountSettingsForm,
  })),
);
const QualityProfilesTabLazy = lazy(() =>
  import("~/components/settings/quality-profiles-tab").then((module) => ({
    default: module.QualityProfilesTab,
  })),
);
const ReleaseProfilesTabLazy = lazy(() =>
  import("~/components/settings/release-profiles-tab").then((module) => ({
    default: module.ReleaseProfilesTab,
  })),
);
const GeneralSettingsFormLazy = lazy(() =>
  import("~/components/settings/system-settings-form").then((module) => ({
    default: module.GeneralSettingsForm,
  })),
);
const SystemStatusLazy = lazy(() =>
  import("~/components/system-status").then((module) => ({
    default: module.SystemStatus,
  })),
);

const SettingsSearchSchema = v.object({
  tab: v.optional(
    v.fallback(
      v.picklist(["general", "automation", "profiles", "release-profiles", "account"]),
      "general",
    ),
    "general",
  ),
});

export const Route = createFileRoute("/_layout/settings")({
  validateSearch: (search) => v.parse(SettingsSearchSchema, search),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(qualitiesQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
      queryClient.ensureQueryData(releaseProfilesQueryOptions()),
    ]);
  },
  component: SettingsPage,
  errorComponent: GeneralError,
});

function SettingsPage() {
  usePageTitle("Settings");
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings">
        <Suspense fallback={null}>
          <SystemStatusLazy />
        </Suspense>
      </PageHeader>

      <Tabs
        value={search.tab}
        onValueChange={(tab) => {
          void navigate({
            to: ".",
            search: {
              tab,
            },
            replace: true,
          });
        }}
        className="w-full space-y-6"
      >
        <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto overflow-y-hidden border-b bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:[-webkit-mask-image:none] sm:[mask-image:none] md:overflow-x-visible">
          <TabsTrigger
            value="general"
            className="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <GearIcon className="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger
            value="automation"
            className="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <ArrowClockwiseIcon className="mr-2 h-4 w-4" />
            Automation
          </TabsTrigger>
          <TabsTrigger
            value="profiles"
            className="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <SlidersHorizontalIcon className="mr-2 h-4 w-4" />
            Quality Profiles
          </TabsTrigger>
          <TabsTrigger
            value="release-profiles"
            className="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <ListChecksIcon className="mr-2 h-4 w-4" />
            Release Profiles
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <KeyIcon className="mr-2 h-4 w-4" />
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <div className="mb-6">
            <h2 className="text-lg font-medium">General Settings</h2>
            <p className="text-sm text-muted-foreground">
              Core application, library, and naming settings
            </p>
          </div>
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">Loading settings...</div>}
          >
            <GeneralSettingsFormLazy mode="general" />
          </Suspense>
        </TabsContent>

        <TabsContent value="automation" className="mt-0">
          <div className="mb-6">
            <h2 className="text-lg font-medium">Automation</h2>
            <p className="text-sm text-muted-foreground">
              Search, qBittorrent, scheduling, and app-wide release defaults
            </p>
          </div>
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">Loading settings...</div>}
          >
            <GeneralSettingsFormLazy mode="automation" />
          </Suspense>
        </TabsContent>

        <TabsContent value="profiles" className="mt-0">
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">Loading profiles...</div>}
          >
            <QualityProfilesTabLazy />
          </Suspense>
        </TabsContent>

        <TabsContent value="release-profiles" className="mt-0">
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">Loading profiles...</div>}
          >
            <ReleaseProfilesTabLazy />
          </Suspense>
        </TabsContent>

        <TabsContent value="account" className="mt-0">
          <div className="mb-6">
            <h2 className="text-lg font-medium">Account</h2>
            <p className="text-sm text-muted-foreground">
              Manage your password, API access, and notification preferences
            </p>
          </div>
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">Loading account...</div>}
          >
            <AccountSettingsFormLazy />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
