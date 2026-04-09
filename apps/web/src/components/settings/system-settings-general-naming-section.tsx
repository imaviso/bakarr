import { SettingSection } from "~/components/settings/form-controls";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { Input } from "~/components/ui/input";

interface SystemSettingsGeneralNamingSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralNamingSection(props: SystemSettingsGeneralNamingSectionProps) {
  return (
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
  );
}
