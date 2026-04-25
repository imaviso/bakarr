import {
  SlidersHorizontalIcon,
  KeyIcon,
  ListChecksIcon,
  ArrowClockwiseIcon,
  GearIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { Schema } from "effect";
import { AccountSettingsForm } from "~/features/settings/account-settings-form";
import { QualityProfilesTab } from "~/features/settings/quality-profiles-tab";
import { ReleaseProfilesTab } from "~/features/settings/release-profiles-tab";
import { GeneralSettingsForm } from "~/features/settings/system-settings-form";
import { GeneralError } from "~/components/shared/general-error";
import { PageHeader } from "~/app/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  profilesQueryOptions,
  qualitiesQueryOptions,
  releaseProfilesQueryOptions,
} from "~/api/profiles";
import { systemConfigQueryOptions } from "~/api/system-config";
import { usePageTitle } from "~/domain/page-title";

const SystemStatusLazy = lazy(() =>
  import("~/components/shared/system-status").then((module) => ({
    default: module.SystemStatus,
  })),
);

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

const SETTINGS_TAB_CONTENT_CLASS = "mt-0 min-h-0 overflow-y-auto overflow-x-hidden";

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

function SettingsPage() {
  usePageTitle("Settings");
  const search = Route.useSearch();
  const navigate = useNavigate();
  const activeTab = search.tab ?? "general";

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden gap-2">
      <PageHeader title="Settings">
        <Suspense fallback={null}>
          <SystemStatusLazy />
        </Suspense>
      </PageHeader>

      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          void navigate({
            to: ".",
            search: {
              tab,
            },
            replace: true,
          });
        }}
        className="min-h-0 flex-1 w-full"
      >
        <TabsList className="shrink-0 mb-6 h-auto w-full justify-start overflow-x-auto overflow-y-hidden border-b bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:[-webkit-mask-image:none] sm:[mask-image:none] md:overflow-x-visible">
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

        <TabsContent value="general" className={SETTINGS_TAB_CONTENT_CLASS}>
          <div className="mb-6">
            <h2 className="text-lg font-medium">General Settings</h2>
            <p className="text-sm text-muted-foreground">
              Core application, library, and naming settings
            </p>
          </div>
          <GeneralSettingsForm mode="general" />
        </TabsContent>

        <TabsContent value="automation" className={SETTINGS_TAB_CONTENT_CLASS}>
          <div className="mb-6">
            <h2 className="text-lg font-medium">Automation</h2>
            <p className="text-sm text-muted-foreground">
              Search, qBittorrent, scheduling, and app-wide release defaults
            </p>
          </div>
          <GeneralSettingsForm mode="automation" />
        </TabsContent>

        <TabsContent value="profiles" className={SETTINGS_TAB_CONTENT_CLASS}>
          <QualityProfilesTab />
        </TabsContent>

        <TabsContent value="release-profiles" className={SETTINGS_TAB_CONTENT_CLASS}>
          <ReleaseProfilesTab />
        </TabsContent>

        <TabsContent value="account" className={SETTINGS_TAB_CONTENT_CLASS}>
          <div className="mb-6">
            <h2 className="text-lg font-medium">Account</h2>
            <p className="text-sm text-muted-foreground">
              Manage your password, API access, and notification preferences
            </p>
          </div>
          <AccountSettingsForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
