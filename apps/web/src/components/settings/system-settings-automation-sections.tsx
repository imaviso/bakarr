import { SystemSettingsAutomationDownloadClientSection } from "~/components/settings/system-settings-automation-download-client-section";
import { SystemSettingsAutomationDownloadDefaultsSection } from "~/components/settings/system-settings-automation-download-defaults-section";
import { SystemSettingsAutomationIndexerSection } from "~/components/settings/system-settings-automation-indexer-section";
import { SystemSettingsAutomationMetadataSection } from "~/components/settings/system-settings-automation-metadata-section";
import { SystemSettingsAutomationSchedulerSection } from "~/components/settings/system-settings-automation-scheduler-section";
import { SystemSettingsAutomationTasksSection } from "~/components/settings/system-settings-automation-tasks-section";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import type { SystemStatus } from "~/lib/api";

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
