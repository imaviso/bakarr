import { SettingRow, SettingSection } from "@/features/settings/form-controls";
import type { SettingsFormApi } from "@/features/settings/system-settings-form-hook";
import {
  SettingNumberField,
  SettingSelectField,
  SettingTextField,
} from "@/features/settings/system-settings-fields";
import {
  IMPORT_MODE_OPTIONS,
  importModeLabel,
  PREFERRED_TITLE_OPTIONS,
  preferredTitleLabel,
} from "@/features/settings/system-settings-schema";
import { TimezonePicker } from "@/components/shared/timezone-picker";

interface SystemSettingsGeneralLibrarySectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralLibrarySection(
  props: SystemSettingsGeneralLibrarySectionProps,
) {
  return (
    <SettingSection title="Library">
      <SettingTextField
        form={props.form}
        name="library.anime_path"
        label="Anime Library Path"
        description="Root folder for anime media"
        inputClassName="w-64"
      />

      <SettingTextField
        form={props.form}
        name="library.manga_path"
        label="Manga Library Path"
        description="Root folder for manga media"
        inputClassName="w-64"
      />

      <SettingTextField
        form={props.form}
        name="library.light_novel_path"
        label="Light Novel Library Path"
        description="Root folder for light novels"
        inputClassName="w-64"
      />

      <SettingTextField
        form={props.form}
        name="library.recycle_path"
        label="Recycle Bin Path"
        description="Deleted files are moved here before permanent deletion"
        inputClassName="w-64"
      />

      <SettingNumberField
        form={props.form}
        name="library.recycle_cleanup_days"
        label="Recycle Cleanup"
        description="Days to keep files in recycle before cleanup"
        min="0"
        suffix="days"
      />

      <SettingSelectField
        form={props.form}
        name="library.import_mode"
        label="Import Mode"
        description="How files are moved from downloads to library"
        options={IMPORT_MODE_OPTIONS}
        formatLabel={importModeLabel}
      />

      <SettingSelectField
        form={props.form}
        name="library.preferred_title"
        label="Preferred Title"
        description="Title language for folder and file naming"
        options={PREFERRED_TITLE_OPTIONS}
        formatLabel={preferredTitleLabel}
      />

      <props.form.Field name="library.airing_timezone">
        {(field) => (
          <SettingRow
            label="Airing Timezone"
            description="Timezone used for wanted and calendar airing times. Use system for browser local time."
          >
            <TimezonePicker
              value={field.state.value ?? "system"}
              onChange={(value) => field.handleChange(value)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <SettingNumberField
        form={props.form}
        name="library.airing_day_start_hour"
        label="Airing Day Start"
        description="Treat airings before this hour as part of the previous day in calendar and wanted views"
        min="0"
        max="23"
        fallbackValue={0}
        suffix="hour"
      />
    </SettingSection>
  );
}
