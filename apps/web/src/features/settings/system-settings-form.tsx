import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SystemSettingsAutomationSections } from "~/features/settings/system-settings-automation-sections";
import { useSystemSettingsForm } from "~/features/settings/system-settings-form-hook";
import { SystemSettingsGeneralSections } from "~/features/settings/system-settings-general-sections";
import { type ConfigSettingsMode } from "~/features/settings/system-settings-schema";
import { Button } from "~/components/ui/button";
import {
  createSystemTaskQuery,
  systemConfigQueryOptions,
  createSystemStatusQuery,
  createTriggerMetadataRefreshMutation,
  createTriggerRssCheckMutation,
  createTriggerScanMutation,
  createUpdateSystemConfigMutation,
  isTaskActive,
  type Config,
} from "~/api";

export function GeneralSettingsForm(props: { mode: ConfigSettingsMode }) {
  const { data: config } = useSuspenseQuery(systemConfigQueryOptions());
  const updateConfig = createUpdateSystemConfigMutation();

  return (
    <SystemForm
      mode={props.mode}
      defaultValues={config}
      onSubmit={(values) => {
        updateConfig.mutate(values);
      }}
      isSaving={updateConfig.isPending}
    />
  );
}

function SystemForm(props: {
  defaultValues: Config;
  isSaving?: boolean;
  mode: ConfigSettingsMode;
  onSubmit: (values: Config) => void;
}) {
  const form = useSystemSettingsForm({
    defaultValues: props.defaultValues,
    onSubmit: props.onSubmit,
  });

  const systemStatus = createSystemStatusQuery();
  const [latestSystemTaskId, setLatestSystemTaskId] = useState<number | undefined>(undefined);
  const latestSystemTask = createSystemTaskQuery(latestSystemTaskId);
  const isSystemTaskRunning =
    latestSystemTask.data !== undefined && isTaskActive(latestSystemTask.data);
  const triggerScan = createTriggerScanMutation();
  const triggerRss = createTriggerRssCheckMutation();
  const triggerMetadataRefresh = createTriggerMetadataRefreshMutation();
  const showsGeneral = props.mode === "general";
  const showsAutomation = props.mode === "automation";

  const handleTriggerScan = () => {
    triggerScan.mutate(undefined, {
      onSuccess: (accepted) => {
        setLatestSystemTaskId(accepted.task_id);
      },
    });
  };

  const handleTriggerRss = () => {
    triggerRss.mutate(undefined, {
      onSuccess: (accepted) => {
        setLatestSystemTaskId(accepted.task_id);
      },
    });
  };

  const handleTriggerMetadataRefresh = () => {
    triggerMetadataRefresh.mutate(undefined, {
      onSuccess: (accepted) => {
        setLatestSystemTaskId(accepted.task_id);
      },
    });
  };

  const submitSystemSettingsForm = async () => {
    await form.handleSubmit();
  };

  return (
    <form
      autoComplete="off"
      action={submitSystemSettingsForm}
      className="space-y-8 pb-24 max-w-3xl"
    >
      <input type="password" style={{ display: "none" }} />

      {showsGeneral && <SystemSettingsGeneralSections form={form} />}

      {showsAutomation && (
        <SystemSettingsAutomationSections
          form={form}
          systemStatus={systemStatus.data}
          onTriggerScan={handleTriggerScan}
          onTriggerRss={handleTriggerRss}
          onTriggerMetadataRefresh={handleTriggerMetadataRefresh}
          triggerScanPending={triggerScan.isPending || isSystemTaskRunning}
          triggerRssPending={triggerRss.isPending || isSystemTaskRunning}
          triggerMetadataRefreshPending={triggerMetadataRefresh.isPending || isSystemTaskRunning}
        />
      )}

      <div className="border-t border-border pt-4 pb-2">
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <Button
              type="submit"
              disabled={!canSubmit || props.isSaving}
              className="w-full sm:w-auto"
            >
              {props.isSaving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
