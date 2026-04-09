import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { TimezonePicker } from "~/components/timezone-picker";
import { SettingRow, SettingSection } from "~/components/settings/form-controls";
import {
  IMPORT_MODE_OPTIONS,
  importModeLabel,
  PREFERRED_TITLE_OPTIONS,
  preferredTitleLabel,
} from "~/components/settings/system-settings-schema";
import type { SettingsFormApi } from "~/components/settings/system-settings-types";
import { handleFiniteNumberInput } from "~/components/settings/system-settings-utils";

interface SystemSettingsGeneralSectionsProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralSections(props: SystemSettingsGeneralSectionsProps) {
  return (
    <>
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
              <Input
                type="number"
                min="0"
                value={field().state.value?.toString() ?? "2"}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                class="w-24"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="general.max_db_connections">
          {(field) => (
            <SettingRow
              label="Max DB Connections"
              description="Upper limit for database connections"
            >
              <Input
                type="number"
                min="1"
                value={field().state.value.toString()}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                class="w-24"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="general.min_db_connections">
          {(field) => (
            <SettingRow
              label="Min DB Connections"
              description="Lower limit for database connections"
            >
              <Input
                type="number"
                min="1"
                value={field().state.value.toString()}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
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
                checked={Boolean(field().state.value)}
                onChange={(checked) => field().handleChange(checked)}
              />
            </SettingRow>
          )}
        </props.form.Field>
      </SettingSection>

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
                <Input
                  type="number"
                  min="0"
                  value={field().state.value.toString()}
                  onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
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
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={(field().state.value ?? 0).toString()}
                  onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
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
                <Input
                  type="number"
                  value={field().state.value.toString()}
                  onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                  class="w-20"
                />
                <span class="text-xs text-muted-foreground">hours</span>
              </div>
            </SettingRow>
          )}
        </props.form.Field>
      </SettingSection>

      <SettingSection title="Naming Formats">
        <div class="py-3 space-y-4">
          <props.form.Field name="library.naming_format">
            {(field) => (
              <div class="space-y-2">
                <div class="text-sm font-medium text-foreground">TV Episodes</div>
                <Input
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                  placeholder="{title} - S{season:02}E{episode:02} - {episode_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}]"
                  class="font-mono text-xs"
                />
                <div class="text-xs text-muted-foreground">
                  {
                    "{title}, {episode}, {episode:02}, {episode:03}, {episode_segment}, {source_episode_segment}, {episode_title}, {season}, {season:02}, {year}, {air_date}, {group}, {resolution}, {quality}, {video_codec}, {audio_codec}, {audio_channels}"
                  }
                </div>
              </div>
            )}
          </props.form.Field>

          <props.form.Field name="library.movie_naming_format">
            {(field) => (
              <div class="space-y-2">
                <div class="text-sm font-medium text-foreground">Movies</div>
                <Input
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                  placeholder="{title}"
                  class="font-mono text-xs"
                />
                <div class="text-xs text-muted-foreground">
                  {
                    "{title}, {year}, {season}, {season:02}, {group}, {resolution}, {quality}, {video_codec}, {audio_codec}, {audio_channels}"
                  }
                </div>
              </div>
            )}
          </props.form.Field>
        </div>
      </SettingSection>
    </>
  );
}
