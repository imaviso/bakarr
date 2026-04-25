import { FiniteNumberInput, SettingRow, SettingSection } from "~/features/settings/form-controls";
import type { SettingsFormApi } from "~/features/settings/system-settings-form-hook";
import {
  IMPORT_MODE_OPTIONS,
  importModeLabel,
  PREFERRED_TITLE_OPTIONS,
  preferredTitleLabel,
} from "~/features/settings/system-settings-schema";
import { TimezonePicker } from "~/components/shared/timezone-picker";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface SystemSettingsGeneralLibrarySectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralLibrarySection(
  props: SystemSettingsGeneralLibrarySectionProps,
) {
  return (
    <SettingSection title="Library">
      <props.form.Field name="library.library_path">
        {(field) => (
          <SettingRow label="Library Path" description="Root folder for your anime library">
            <Input
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              className="w-64"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="library.recycle_path">
        {(field) => (
          <SettingRow
            label="Recycle Bin Path"
            description="Deleted files are moved here before permanent deletion"
          >
            <Input
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              className="w-64"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="library.recycle_cleanup_days">
        {(field) => (
          <SettingRow
            label="Recycle Cleanup"
            description="Days to keep files in recycle before cleanup"
          >
            <div className="flex items-center gap-2">
              <FiniteNumberInput
                min="0"
                value={field.state.value}
                onChange={field.handleChange}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="library.import_mode">
        {(field) => (
          <SettingRow
            label="Import Mode"
            description="How files are moved from downloads to library"
          >
            <Select
              value={field.state.value}
              onValueChange={(value) => {
                if (value !== null) {
                  field.handleChange(value);
                }
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {importModeLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="library.preferred_title">
        {(field) => (
          <SettingRow
            label="Preferred Title"
            description="Title language for folder and file naming"
          >
            <Select
              value={field.state.value}
              onValueChange={(value) => {
                if (value !== null) {
                  field.handleChange(value);
                }
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {PREFERRED_TITLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {preferredTitleLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        )}
      </props.form.Field>

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

      <props.form.Field name="library.airing_day_start_hour">
        {(field) => (
          <SettingRow
            label="Airing Day Start"
            description="Treat airings before this hour as part of the previous day in calendar and wanted views"
          >
            <div className="flex items-center gap-2">
              <FiniteNumberInput
                min="0"
                max="23"
                value={field.state.value}
                fallbackValue={0}
                onChange={field.handleChange}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">hour</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
