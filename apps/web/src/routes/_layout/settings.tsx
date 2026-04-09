import {
  IconAdjustments,
  IconKey,
  IconListCheck,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-solidjs";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { AccountSettingsForm } from "~/components/settings/account-settings-form";
import { QualityProfilesTab } from "~/components/settings/quality-profiles-tab";
import { ReleaseProfilesTab } from "~/components/settings/release-profiles-tab";
import { GeneralSettingsForm } from "~/components/settings/system-settings-form";
import { SystemStatus } from "~/components/system-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  profilesQueryOptions,
  qualitiesQueryOptions,
  releaseProfilesQueryOptions,
  systemConfigQueryOptions,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/settings")({
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
  const [activeTab, setActiveTab] = createSignal("general");

  return (
    <div class="space-y-6">
      <PageHeader title="Settings">
        <SystemStatus />
      </PageHeader>

      <Tabs
        defaultValue="general"
        value={activeTab()}
        onChange={setActiveTab}
        class="w-full space-y-6"
      >
        <TabsList class="w-full justify-start border-b rounded-none p-0 h-auto bg-transparent mb-6 overflow-x-auto [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:[-webkit-mask-image:none] sm:[mask-image:none]">
          <TabsTrigger
            value="general"
            class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <IconSettings class="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger
            value="automation"
            class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <IconRefresh class="mr-2 h-4 w-4" />
            Automation
          </TabsTrigger>
          <TabsTrigger
            value="profiles"
            class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <IconAdjustments class="mr-2 h-4 w-4" />
            Quality Profiles
          </TabsTrigger>
          <TabsTrigger
            value="release-profiles"
            class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <IconListCheck class="mr-2 h-4 w-4" />
            Release Profiles
          </TabsTrigger>
          <TabsTrigger
            value="account"
            class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
          >
            <IconKey class="mr-2 h-4 w-4" />
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="mt-0">
          <div class="mb-6">
            <h2 class="text-lg font-medium">General Settings</h2>
            <p class="text-sm text-muted-foreground">
              Core application, library, and naming settings
            </p>
          </div>
          <GeneralSettingsForm mode="general" />
        </TabsContent>

        <TabsContent value="automation" class="mt-0">
          <div class="mb-6">
            <h2 class="text-lg font-medium">Automation</h2>
            <p class="text-sm text-muted-foreground">
              Search, qBittorrent, scheduling, and app-wide release defaults
            </p>
          </div>
          <GeneralSettingsForm mode="automation" />
        </TabsContent>

        <TabsContent value="profiles" class="mt-0">
          <QualityProfilesTab />
        </TabsContent>

        <TabsContent value="release-profiles" class="mt-0">
          <ReleaseProfilesTab />
        </TabsContent>

        <TabsContent value="account" class="mt-0">
          <div class="mb-6">
            <h2 class="text-lg font-medium">Account</h2>
            <p class="text-sm text-muted-foreground">Manage your password and API access</p>
          </div>
          <AccountSettingsForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
