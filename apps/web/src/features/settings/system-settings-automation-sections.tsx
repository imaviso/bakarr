import { SystemSettingsAutomationDownloadClientSection } from "~/features/settings/system-settings-automation-download-client-section";
import { SystemSettingsAutomationDownloadDefaultsSection } from "~/features/settings/system-settings-automation-download-defaults-section";
import { SystemSettingsAutomationIndexerSection } from "~/features/settings/system-settings-automation-indexer-section";
import { SystemSettingsAutomationMetadataSection } from "~/features/settings/system-settings-automation-metadata-section";
import { SystemSettingsAutomationSchedulerSection } from "~/features/settings/system-settings-automation-scheduler-section";
import { SystemSettingsAutomationTasksSection } from "~/features/settings/system-settings-automation-tasks-section";
import type { SettingsFormApi } from "~/features/settings/system-settings-form-hook";
import type { SystemStatus } from "~/api";

interface SystemSettingsAutomationSectionsProps {
  form: SettingsFormApi;
  onTriggerMetadataRefresh: () => void;
  onTriggerRss: () => void;
  onTriggerScan: () => void;
  systemStatus: SystemStatus | undefined;
  triggerMetadataRefreshPending: boolean;
  triggerRssPending: boolean;
  triggerScanPending: boolean;
}

export function SystemSettingsAutomationSections(props: SystemSettingsAutomationSectionsProps) {
  return (
    <>
      <SystemSettingsAutomationDownloadClientSection form={props.form} />
      <SystemSettingsAutomationMetadataSection
        form={props.form}
        systemStatus={props.systemStatus}
      />
      <SystemSettingsAutomationSchedulerSection form={props.form} />
      <SystemSettingsAutomationTasksSection
        onTriggerScan={props.onTriggerScan}
        onTriggerRss={props.onTriggerRss}
        onTriggerMetadataRefresh={props.onTriggerMetadataRefresh}
        systemStatus={props.systemStatus}
        triggerScanPending={props.triggerScanPending}
        triggerRssPending={props.triggerRssPending}
        triggerMetadataRefreshPending={props.triggerMetadataRefreshPending}
      />
      <SystemSettingsAutomationIndexerSection form={props.form} />
      <SystemSettingsAutomationDownloadDefaultsSection form={props.form} />
    </>
  );
}
