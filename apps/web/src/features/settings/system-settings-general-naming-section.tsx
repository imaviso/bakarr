import { SettingSection } from "~/features/settings/form-controls";
import type { SettingsFormApi } from "~/features/settings/system-settings-form-hook";
import { Input } from "~/components/ui/input";

interface SystemSettingsGeneralNamingSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralNamingSection(props: SystemSettingsGeneralNamingSectionProps) {
  return (
    <SettingSection title="Naming Formats">
      <div className="py-3 space-y-4">
        <props.form.Field name="library.naming_format">
          {(field) => (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">TV Episodes</div>
              <Input
                value={field.state.value}
                onInput={(event) => field.handleChange(event.currentTarget.value)}
                placeholder="{title} - S{season:02}E{episode:02} - {unit_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}]"
                className="font-mono text-xs"
              />
              <div className="text-xs text-muted-foreground">
                {
                  "{title}, {episode}, {episode:02}, {episode:03}, {episode_segment}, {source_episode_segment}, {unit_title}, {season}, {season:02}, {year}, {air_date}, {group}, {resolution}, {quality}, {video_codec}, {audio_codec}, {audio_channels}"
                }
              </div>
            </div>
          )}
        </props.form.Field>

        <props.form.Field name="library.movie_naming_format">
          {(field) => (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Movies</div>
              <Input
                value={field.state.value}
                onInput={(event) => field.handleChange(event.currentTarget.value)}
                placeholder="{title}"
                className="font-mono text-xs"
              />
              <div className="text-xs text-muted-foreground">
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
