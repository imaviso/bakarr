import { SettingSection } from "@/features/settings/form-controls";
import type { SettingsFormApi } from "@/features/settings/system-settings-form-hook";
import {
  SettingNumberField,
  SettingSwitchField,
  SettingTextField,
} from "@/features/settings/system-settings-fields";

interface SystemSettingsAutomationSchedulerSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsAutomationSchedulerSection(
  props: SystemSettingsAutomationSchedulerSectionProps,
) {
  return (
    <SettingSection title="Scheduler">
      <SettingSwitchField
        form={props.form}
        name="scheduler.enabled"
        label="Enable Scheduler"
        description="Run automated background tasks"
      />

      <SettingNumberField
        form={props.form}
        name="scheduler.check_interval_minutes"
        label="Check Interval"
        description="Minutes between RSS checks"
        suffix="min"
      />

      <SettingNumberField
        form={props.form}
        name="scheduler.max_concurrent_checks"
        label="Max Concurrent Checks"
        description="Parallel media checks"
      />

      <SettingNumberField
        form={props.form}
        name="scheduler.check_delay_seconds"
        label="Check Delay"
        description="Delay between consecutive automated checks"
        min="0"
        suffix="sec"
      />

      <SettingNumberField
        form={props.form}
        name="scheduler.metadata_refresh_hours"
        label="Metadata Refresh"
        description="Hours between metadata updates"
        suffix="hours"
      />

      <SettingNumberField
        form={props.form}
        name="library.auto_scan_interval_hours"
        label="Library Scan Interval"
        description="Hours between automatic library scans. Set to 0 to disable."
        min="0"
        suffix="hours"
      />

      <SettingTextField
        form={props.form}
        name="scheduler.cron_expression"
        label="Cron Expression"
        description="Custom schedule (overrides interval)"
        placeholder="0 */6 * * *"
        inputClassName="w-36 font-mono text-xs"
      />
    </SettingSection>
  );
}
