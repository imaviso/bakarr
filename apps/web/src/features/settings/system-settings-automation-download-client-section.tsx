import { Schema } from "effect";
import { SettingRow, SettingSection } from "~/features/settings/form-controls";
import type { SettingsFormApi } from "~/features/settings/system-settings-form-hook";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";

interface SystemSettingsAutomationDownloadClientSectionProps {
  form: SettingsFormApi;
}

const RatioLimitInputSchema = Schema.Union(Schema.Literal(""), Schema.NumberFromString);

function decodeRatioLimitInput(value: string, fallback: number | null | undefined): number | null {
  const decoded = Schema.decodeUnknownEither(RatioLimitInputSchema)(value);
  if (decoded._tag === "Left") return fallback ?? null;

  return decoded.right === "" ? null : decoded.right;
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
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.url">
        {(field) => (
          <SettingRow label="URL" description="qBittorrent Web UI address">
            <Input
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              placeholder="http://localhost:8080"
              className="w-56"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.username">
        {(field) => (
          <SettingRow label="Username">
            <Input
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              autoComplete="off"
              className="w-40"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.password">
        {(field) => (
          <SettingRow label="Password">
            <Input
              type="password"
              value={field.state.value || ""}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              autoComplete="off"
              className="w-40"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.default_category">
        {(field) => (
          <SettingRow label="Category" description="qBittorrent category for downloads">
            <Input
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              placeholder="bakarr"
              className="w-32"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.save_path">
        {(field) => (
          <SettingRow
            label="Save Path"
            description="qBittorrent download folder for newly added torrents"
          >
            <Input
              value={field.state.value ?? ""}
              onInput={(event) => field.handleChange(event.currentTarget.value || null)}
              placeholder="/downloads/anime"
              className="w-64"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="qbittorrent.ratio_limit">
        {(field) => (
          <SettingRow
            label="Ratio Limit"
            description="Per-torrent share ratio. Leave blank to use qBittorrent default"
          >
            <Input
              type="number"
              min="0"
              step="0.1"
              value={field.state.value ?? ""}
              onInput={(event) =>
                field.handleChange(
                  decodeRatioLimitInput(event.currentTarget.value, field.state.value),
                )
              }
              placeholder="1.0"
              className="w-24"
            />
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
