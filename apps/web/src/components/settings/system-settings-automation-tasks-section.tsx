import type { Accessor } from "solid-js";
import { SettingRow, SettingSection } from "~/components/settings/form-controls";
import { formatLastRun } from "~/components/settings/system-settings-schema";
import { Button } from "~/components/ui/button";
import type { SystemStatus } from "~/lib/api";

interface SystemSettingsAutomationTasksSectionProps {
  onTriggerMetadataRefresh: () => void;
  onTriggerRss: () => void;
  onTriggerScan: () => void;
  systemStatus: Accessor<SystemStatus | undefined>;
  triggerMetadataRefreshPending: boolean;
  triggerRssPending: boolean;
  triggerScanPending: boolean;
}

export function SystemSettingsAutomationTasksSection(
  props: SystemSettingsAutomationTasksSectionProps,
) {
  return (
    <SettingSection title="Tasks">
      <SettingRow
        label="Library Scan"
        description={`Last run: ${formatLastRun(props.systemStatus()?.last_scan)}`}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={props.onTriggerScan}
          disabled={props.triggerScanPending}
        >
          {props.triggerScanPending ? "Running..." : "Run Now"}
        </Button>
      </SettingRow>

      <SettingRow
        label="RSS Check"
        description={`Last run: ${formatLastRun(props.systemStatus()?.last_rss)}`}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={props.onTriggerRss}
          disabled={props.triggerRssPending}
        >
          {props.triggerRssPending ? "Running..." : "Run Now"}
        </Button>
      </SettingRow>

      <SettingRow label="Metadata Refresh" description="Refresh anime metadata from AniList">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={props.onTriggerMetadataRefresh}
          disabled={props.triggerMetadataRefreshPending}
        >
          {props.triggerMetadataRefreshPending ? "Running..." : "Run Now"}
        </Button>
      </SettingRow>
    </SettingSection>
  );
}
