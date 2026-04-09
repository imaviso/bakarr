import { SettingRow, SettingSection } from "~/components/settings/form-controls";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";

interface SystemSettingsAutomationDownloadClientSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsAutomationDownloadClientSection(
  props: SystemSettingsAutomationDownloadClientSectionProps,
) {
  return (
    <SettingSection title="Download Client">
      <props.form.Field name="qbittorrent.enabled">
        {(field) => (
          <SettingRow
            label="Enable qBittorrent"
            description="Connect to qBittorrent for downloading"
          >
            <Switch
              checked={Boolean(field().state.value)}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.url">
        {(field) => (
          <SettingRow label="URL" description="qBittorrent Web UI address">
            <Input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              placeholder="http://localhost:8080"
              class="w-56"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.username">
        {(field) => (
          <SettingRow label="Username">
            <Input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              autocomplete="off"
              class="w-40"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.password">
        {(field) => (
          <SettingRow label="Password">
            <Input
              type="password"
              value={field().state.value || ""}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              autocomplete="off"
              class="w-40"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.default_category">
        {(field) => (
          <SettingRow label="Category" description="qBittorrent category for downloads">
            <Input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              placeholder="bakarr"
              class="w-32"
            />
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
