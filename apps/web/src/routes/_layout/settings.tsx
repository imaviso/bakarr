import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Schema, SchemaTransformation } from "effect";
import { AccountSettingsForm } from "@/features/settings/account-settings-form";
import { ObservabilitySettingsPanel } from "@/features/settings/observability-settings-panel";
import { QualityProfilesTab } from "@/features/settings/quality-profiles-tab";
import { ReleaseProfilesTab } from "@/features/settings/release-profiles-tab";
import { GeneralSettingsForm } from "@/features/settings/system-settings-form";
import { GeneralError } from "@/components/shared/general-error";
import { PageHeader } from "@/app/layout/page-header";
import { PageShell } from "@/app/layout/page-shell";
import { SettingsMobileSelect, SettingsNav } from "@/features/settings/settings-nav";
import {
  profilesQueryOptions,
  qualitiesQueryOptions,
  releaseProfilesQueryOptions,
} from "@/api/profiles";
import { observabilityStatusQueryOptions, systemConfigQueryOptions } from "@/api/system-config";
import { usePageTitle } from "@/app/page-title";

const SettingsTabSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Literals([
      "general",
      "automation",
      "observability",
      "profiles",
      "release-profiles",
      "account",
    ]),
    SchemaTransformation.transform({
      decode: (s) => {
        switch (s) {
          case "general":
          case "automation":
          case "observability":
          case "profiles":
          case "release-profiles":
          case "account":
            return s;
          default:
            return "general";
        }
      },
      encode: (s) => s,
    }),
  ),
);

const SettingsSearchSchema = Schema.Struct({
  tab: Schema.optional(SettingsTabSchema),
});

export const Route = createFileRoute("/_layout/settings")({
  validateSearch: Schema.toStandardSchemaV1(SettingsSearchSchema),
  loaderDeps: ({ search }) => ({ tab: search.tab ?? "general" }),
  loader: async ({ context: { queryClient }, deps }) => {
    switch (deps.tab) {
      case "general":
      case "automation":
        await queryClient.ensureQueryData(systemConfigQueryOptions());
        return;
      case "observability":
        await queryClient.ensureQueryData(observabilityStatusQueryOptions());
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
            {(activeTab === "general" || activeTab === "automation") && (
              <div
                role="tabpanel"
                id="panel-general"
                aria-labelledby={`tab-${activeTab}`}
                className="space-y-6"
              >
                {activeTab === "general" ? (
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-mono text-sm font-medium tracking-tight">
                      General Settings
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Core application, library, and naming settings
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-mono text-sm font-medium tracking-tight">Automation</h2>
                    <p className="text-xs text-muted-foreground">
                      Search, qBittorrent, scheduling, and app-wide release defaults
                    </p>
                  </div>
                )}
                <GeneralSettingsForm activeMode={activeTab} />
              </div>
            )}

            {activeTab === "profiles" && (
              <div role="tabpanel" id="panel-profiles" aria-labelledby="tab-profiles">
                <QualityProfilesTab />
              </div>
            )}

            {activeTab === "observability" && (
              <div
                role="tabpanel"
                id="panel-observability"
                aria-labelledby="tab-observability"
                className="space-y-6"
              >
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-mono text-sm font-medium tracking-tight">Observability</h2>
                  <p className="text-xs text-muted-foreground">
                    Export status, scrape settings, and external observability links
                  </p>
                </div>
                <ObservabilitySettingsPanel />
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
