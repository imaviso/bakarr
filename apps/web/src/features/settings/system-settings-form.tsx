import { useSuspenseQuery } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { toast } from "sonner";
import { SystemSettingsAutomationSections } from "@/features/settings/system-settings-automation-sections";
import { useSystemSettingsForm } from "@/features/settings/system-settings-form-hook";
import { SystemSettingsGeneralSections } from "@/features/settings/system-settings-general-sections";
import { type ConfigSettingsMode } from "@/features/settings/system-settings-schema";
import { Button } from "@/components/ui/button";
import { useSystemTaskQuery, isTaskActive } from "@/api/operations-tasks";
import {
  systemConfigQueryOptions,
  useSystemStatusQuery,
  useTriggerMetadataRefreshMutation,
  useTriggerRssCheckMutation,
  useTriggerScanMutation,
  useUpdateSystemConfigMutation,
} from "@/api/system-config";
import { errorMessage } from "@/api/effect/errors";
import type { Config } from "@/api/contracts";

export function GeneralSettingsForm(props: { activeMode: ConfigSettingsMode }) {
  const { data: config } = useSuspenseQuery(systemConfigQueryOptions());
  const updateConfig = useUpdateSystemConfigMutation();

  return (
    <SystemForm
      activeMode={props.activeMode}
      defaultValues={config}
      onSubmit={(values) => {
        updateConfig.mutate(values, {
          onSuccess: () => {
            toast.success("Settings saved");
          },
          onError: (error) => {
            toast.error(errorMessage(error, "Failed to save settings"));
          },
        });
      }}
      isSaving={updateConfig.isPending}
    />
  );
}

function SystemForm(props: {
  defaultValues: Config;
  isSaving?: boolean;
  activeMode: ConfigSettingsMode;
  onSubmit: (values: Config) => void;
}) {
  const form = useSystemSettingsForm({
    defaultValues: props.defaultValues,
    onSubmit: props.onSubmit,
  });

  const systemStatus = useSystemStatusQuery();
  const triggerScan = useTriggerScanMutation();
  const triggerRss = useTriggerRssCheckMutation();
  const triggerMetadataRefresh = useTriggerMetadataRefreshMutation();
  const latestSystemTaskId =
    triggerMetadataRefresh.data?.task_id ?? triggerRss.data?.task_id ?? triggerScan.data?.task_id;
  const latestSystemTask = useSystemTaskQuery(latestSystemTaskId);
  const isSystemTaskRunning =
    latestSystemTask.data !== undefined && isTaskActive(latestSystemTask.data);

  // Both mode sections stay mounted so unsaved edits survive tab switches.
  const showsGeneral = props.activeMode === "general";
  const showsAutomation = props.activeMode === "automation";

  const handleTriggerScan = () => {
    triggerScan.mutate(undefined);
  };

  const handleTriggerRss = () => {
    triggerRss.mutate(undefined);
  };

  const handleTriggerMetadataRefresh = () => {
    triggerMetadataRefresh.mutate(undefined);
  };

  const submitSystemSettingsForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  };

  return (
    <form
      autoComplete="off"
      onSubmit={submitSystemSettingsForm}
      className="space-y-8 pb-24 max-w-3xl"
    >
      <div className={showsGeneral ? undefined : "hidden"}>
        <SystemSettingsGeneralSections form={form} />
      </div>

      <div className={showsAutomation ? undefined : "hidden"}>
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
      </div>

      <div className="border-t border-border pt-4 pb-2">
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <Button
              type="submit"
              isDisabled={!canSubmit || Boolean(props.isSaving)}
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
