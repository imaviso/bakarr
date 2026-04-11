import { Show } from "solid-js";
import { SystemSettingsAutomationSections } from "~/components/settings/system-settings-automation-sections";
import { createSystemSettingsForm } from "~/components/settings/system-settings-form-factory";
import { SystemSettingsGeneralSections } from "~/components/settings/system-settings-general-sections";
import { type ConfigSettingsMode } from "~/components/settings/system-settings-schema";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  createSystemConfigQuery,
  createSystemStatusQuery,
  createTriggerMetadataRefreshMutation,
  createTriggerRssCheckMutation,
  createTriggerScanMutation,
  createUpdateSystemConfigMutation,
  type Config,
} from "~/lib/api";

export function GeneralSettingsForm(props: { mode: ConfigSettingsMode }) {
  const configQuery = createSystemConfigQuery();
  const updateConfig = createUpdateSystemConfigMutation();

  return (
    <Show when={configQuery.data} fallback={<Skeleton class="h-96 rounded-lg" />}>
      {(config) => (
        <SystemForm
          mode={props.mode}
          defaultValues={config()}
          onSubmit={(values) => {
            updateConfig.mutate(values);
          }}
          isSaving={updateConfig.isPending}
        />
      )}
    </Show>
  );
}

function SystemForm(props: {
  defaultValues: Config;
  isSaving?: boolean;
  mode: ConfigSettingsMode;
  onSubmit: (values: Config) => void;
}) {
  const form = createSystemSettingsForm({
    defaultValues: props.defaultValues,
    onSubmit: props.onSubmit,
  });

  const systemStatus = createSystemStatusQuery();
  const triggerScan = createTriggerScanMutation();
  const triggerRss = createTriggerRssCheckMutation();
  const triggerMetadataRefresh = createTriggerMetadataRefreshMutation();
  const showsGeneral = () => props.mode === "general";
  const showsAutomation = () => props.mode === "automation";

  const handleTriggerScan = () => {
    triggerScan.mutate();
  };

  const handleTriggerRss = () => {
    triggerRss.mutate();
  };

  const handleTriggerMetadataRefresh = () => {
    triggerMetadataRefresh.mutate();
  };

  return (
    <form
      autocomplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      class="space-y-8 pb-24 max-w-3xl"
    >
      <input type="password" style={{ display: "none" }} />

      <Show when={showsGeneral()}>
        <SystemSettingsGeneralSections form={form} />
      </Show>

      <Show when={showsAutomation()}>
        <SystemSettingsAutomationSections
          form={form}
          systemStatus={systemStatus.data}
          onTriggerScan={handleTriggerScan}
          onTriggerRss={handleTriggerRss}
          onTriggerMetadataRefresh={handleTriggerMetadataRefresh}
          triggerScanPending={triggerScan.isPending}
          triggerRssPending={triggerRss.isPending}
          triggerMetadataRefreshPending={triggerMetadataRefresh.isPending}
        />
      </Show>

      <div class="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-background via-background to-transparent -mx-1 px-1">
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {(state) => (
            <Button type="submit" disabled={!state()[0] || props.isSaving} class="w-full sm:w-auto">
              {props.isSaving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
