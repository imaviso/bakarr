import { FiniteNumberInput, SettingRow, SettingSection } from "~/components/settings/form-controls";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import {
  IMPORT_MODE_OPTIONS,
  importModeLabel,
  PREFERRED_TITLE_OPTIONS,
  preferredTitleLabel,
} from "~/components/settings/system-settings-schema";
import { TimezonePicker } from "~/components/timezone-picker";
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
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              class="w-64"
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
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              class="w-64"
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
            <div class="flex items-center gap-2">
              <FiniteNumberInput
                min="0"
                value={field().state.value}
                onChange={field().handleChange}
                class="w-20"
              />
              <span class="text-xs text-muted-foreground">days</span>
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
              name={field().name}
              value={field().state.value}
              onChange={(value) => value && field().handleChange(value)}
              options={[...IMPORT_MODE_OPTIONS]}
              placeholder="Select..."
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>
                  {importModeLabel(itemProps.item.rawValue)}
                </SelectItem>
              )}
            >
              <SelectTrigger class="w-32">
                <SelectValue<string>>
                  {(state) =>
                    state.selectedOption() ? importModeLabel(state.selectedOption()) : "Select..."
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
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
              name={field().name}
              value={field().state.value}
              onChange={(value) => value && field().handleChange(value)}
              options={[...PREFERRED_TITLE_OPTIONS]}
              placeholder="Select..."
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>
                  {preferredTitleLabel(itemProps.item.rawValue)}
                </SelectItem>
              )}
            >
              <SelectTrigger class="w-32">
                <SelectValue<string>>
                  {(state) =>
                    state.selectedOption()
                      ? preferredTitleLabel(state.selectedOption())
                      : "Select..."
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
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
              value={field().state.value ?? "system"}
              onChange={(value) => field().handleChange(value)}
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
            <div class="flex items-center gap-2">
              <FiniteNumberInput
                min="0"
                max="23"
                value={field().state.value}
                fallbackValue={0}
                onChange={field().handleChange}
                class="w-20"
              />
              <span class="text-xs text-muted-foreground">hour</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="library.auto_scan_interval_hours">
        {(field) => (
          <SettingRow
            label="Auto Scan Interval"
            description="Hours between automatic library scans"
          >
            <div class="flex items-center gap-2">
              <FiniteNumberInput
                value={field().state.value}
                onChange={field().handleChange}
                class="w-20"
              />
              <span class="text-xs text-muted-foreground">hours</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
