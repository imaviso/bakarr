import { SettingSection } from "@/features/settings/form-controls";
import type { SettingsFormApi } from "@/features/settings/system-settings-form-hook";
import {
  SettingNumberField,
  SettingSwitchField,
  SettingTextField,
} from "@/features/settings/system-settings-fields";

interface SystemSettingsAutomationIndexerSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsAutomationIndexerSection(
  props: SystemSettingsAutomationIndexerSectionProps,
) {
  return (
    <SettingSection title="Indexer">
      <SettingTextField
        form={props.form}
        name="nyaa.base_url"
        label="Nyaa URL"
        description="Base URL for Nyaa.si"
        placeholder="https://nyaa.si"
        inputClassName="w-48"
      />

      <SettingNumberField
        form={props.form}
        name="nyaa.min_seeders"
        label="Minimum Seeders"
        description="Skip releases with fewer seeders"
      />

      <SettingTextField
        form={props.form}
        name="nyaa.default_category"
        label="Default Category"
        description="Default Nyaa category code for searches"
        placeholder="1_2"
        inputClassName="w-24"
      />

      <SettingTextField
        form={props.form}
        name="nyaa.preferred_resolution"
        label="Preferred Resolution"
        description="Optional hint for ranking search results"
        placeholder="1080p"
        inputClassName="w-24"
      />

      <SettingSwitchField
        form={props.form}
        name="nyaa.filter_remakes"
        label="Filter Remakes"
        description="Exclude remakes from search results"
      />
    </SettingSection>
  );
}
