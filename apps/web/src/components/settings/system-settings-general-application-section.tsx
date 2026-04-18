import { FiniteNumberInput, SettingRow, SettingSection } from "~/components/settings/form-controls";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

interface SystemSettingsGeneralApplicationSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralApplicationSection(
  props: SystemSettingsGeneralApplicationSectionProps,
) {
  return (
    <SettingSection title="Application">
      <props.form.Field name="general.database_path">
        {(field) => (
          <SettingRow label="Database Path" description="Current database file path">
            <Input value={field().state.value} readOnly class="w-64" />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="general.log_level">
        {(field) => (
          <SettingRow label="Log Level" description="Control verbosity of application logs">
            <Select
              name={field().name}
              value={field().state.value}
              onChange={(value) => value && field().handleChange(value)}
              options={["error", "warn", "info", "debug", "trace"]}
              placeholder="Select..."
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
              )}
            >
              <SelectTrigger class="w-32">
                <SelectValue<string>>{(state) => state.selectedOption()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="general.images_path">
        {(field) => (
          <SettingRow label="Images Path" description="Local cache for cover art and images">
            <Input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              class="w-64"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="general.worker_threads">
        {(field) => (
          <SettingRow
            label="Worker Threads"
            description="Number of threads for background tasks (0 = auto)"
          >
            <FiniteNumberInput
              min="0"
              value={field().state.value}
              fallbackValue={2}
              onChange={field().handleChange}
              class="w-24"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="general.max_db_connections">
        {(field) => (
          <SettingRow label="Max DB Connections" description="Upper limit for database connections">
            <FiniteNumberInput
              min="1"
              value={field().state.value}
              onChange={field().handleChange}
              class="w-24"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="general.min_db_connections">
        {(field) => (
          <SettingRow label="Min DB Connections" description="Lower limit for database connections">
            <FiniteNumberInput
              min="1"
              value={field().state.value}
              onChange={field().handleChange}
              class="w-24"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="general.suppress_connection_errors">
        {(field) => (
          <SettingRow
            label="Suppress Connection Errors"
            description="Hide noisy retry logs from qBittorrent/Network"
          >
            <Switch
              checked={field().state.value}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
