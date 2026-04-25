import { FiniteNumberInput, SettingRow, SettingSection } from "~/features/settings/form-controls";
import type { SettingsFormApi } from "~/features/settings/system-settings-form-hook";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";

interface SystemSettingsAutomationSchedulerSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsAutomationSchedulerSection(
  props: SystemSettingsAutomationSchedulerSectionProps,
) {
  return (
    <SettingSection title="Scheduler">
      <props.form.Field name="scheduler.enabled">
        {(field) => (
          <SettingRow label="Enable Scheduler" description="Run automated background tasks">
            <Switch
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="scheduler.check_interval_minutes">
        {(field) => (
          <SettingRow label="Check Interval" description="Minutes between RSS checks">
            <div className="flex items-center gap-2">
              <FiniteNumberInput
                value={field.state.value}
                onChange={field.handleChange}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="scheduler.max_concurrent_checks">
        {(field) => (
          <SettingRow label="Max Concurrent Checks" description="Parallel anime checks">
            <FiniteNumberInput
              value={field.state.value}
              onChange={field.handleChange}
              className="w-20"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="scheduler.check_delay_seconds">
        {(field) => (
          <SettingRow label="Check Delay" description="Delay between consecutive automated checks">
            <div className="flex items-center gap-2">
              <FiniteNumberInput
                min="0"
                value={field.state.value}
                onChange={field.handleChange}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="scheduler.metadata_refresh_hours">
        {(field) => (
          <SettingRow label="Metadata Refresh" description="Hours between metadata updates">
            <div className="flex items-center gap-2">
              <FiniteNumberInput
                value={field.state.value}
                onChange={field.handleChange}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="scheduler.cron_expression">
        {(field) => (
          <SettingRow label="Cron Expression" description="Custom schedule (overrides interval)">
            <Input
              value={field.state.value || ""}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              placeholder="0 */6 * * *"
              className="w-36 font-mono text-xs"
            />
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
