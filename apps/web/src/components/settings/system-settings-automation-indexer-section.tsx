import { FiniteNumberInput, SettingRow, SettingSection } from "~/components/settings/form-controls";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";

interface SystemSettingsAutomationIndexerSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsAutomationIndexerSection(
  props: SystemSettingsAutomationIndexerSectionProps,
) {
  return (
    <SettingSection title="Indexer">
      <props.form.Field name="nyaa.base_url">
        {(field) => (
          <SettingRow label="Nyaa URL" description="Base URL for Nyaa.si">
            <Input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              placeholder="https://nyaa.si"
              class="w-48"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="nyaa.min_seeders">
        {(field) => (
          <SettingRow label="Minimum Seeders" description="Skip releases with fewer seeders">
            <FiniteNumberInput
              value={field().state.value}
              onChange={field().handleChange}
              class="w-20"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="nyaa.default_category">
        {(field) => (
          <SettingRow
            label="Default Category"
            description="Default Nyaa category code for searches"
          >
            <Input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              placeholder="1_2"
              class="w-24"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="nyaa.preferred_resolution">
        {(field) => (
          <SettingRow
            label="Preferred Resolution"
            description="Optional hint for ranking search results"
          >
            <Input
              value={field().state.value ?? ""}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              placeholder="1080p"
              class="w-24"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="nyaa.filter_remakes">
        {(field) => (
          <SettingRow label="Filter Remakes" description="Exclude remakes from search results">
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
