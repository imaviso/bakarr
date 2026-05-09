import { Schema } from "effect";
import { PathMappingsEditor, SettingRow, SettingSection } from "~/features/settings/form-controls";
import type { SettingsFormApi } from "~/features/settings/system-settings-form-hook";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { SectionLabel } from "~/components/shared/section-label";

interface SystemSettingsDownloadsSectionProps {
  form: SettingsFormApi;
}

function SubSectionTitle({ children }: { children: string }) {
  return <SectionLabel className="block px-0.5 pt-4 pb-1">{children}</SectionLabel>;
}

const RatioLimitInputSchema = Schema.Union(Schema.Literal(""), Schema.NumberFromString);

function decodeRatioLimitInput(value: string, fallback: number | null | undefined): number | null {
  const decoded = Schema.decodeUnknownEither(RatioLimitInputSchema)(value);
  if (decoded._tag === "Left") return fallback ?? null;

  return decoded.right === "" ? null : decoded.right;
}

export function SystemSettingsDownloadsSection(props: SystemSettingsDownloadsSectionProps) {
  return (
    <SettingSection title="Downloads">
      <SubSectionTitle>Download Client</SubSectionTitle>

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

      <SubSectionTitle>Import Defaults</SubSectionTitle>

      <props.form.Field name="downloads.root_path">
        {(field) => (
          <SettingRow
            label="Download Path"
            description="Folder Bakarr watches for completed downloads"
          >
            <Input
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              className="w-64"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.remote_path_mappings">
        {(field) => (
          <SettingRow
            label="Remote Path Mappings"
            description="One mapping per line using 'from => to'"
            className="items-start"
          >
            <div className="w-80 space-y-2">
              <PathMappingsEditor
                value={field.state.value}
                onChange={field.handleChange}
                placeholder="/downloads => /mnt/downloads\n/data/torrents => /srv/torrents"
                rows={4}
              />
              <div className="text-xs text-muted-foreground">
                Used when qBittorrent reports a different path than Bakarr can see locally.
              </div>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.create_anime_folders">
        {(field) => (
          <SettingRow
            label="Create Anime Folders"
            description="Group downloaded files by anime title before import"
          >
            <Switch
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.reconcile_completed_downloads">
        {(field) => (
          <SettingRow
            label="Import Completed Torrents"
            description="Automatically import finished qBittorrent downloads"
          >
            <Switch
              checked={field.state.value ?? true}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.remove_torrent_on_import">
        {(field) => (
          <SettingRow
            label="Remove Torrent After Import"
            description="Delete torrent from qBittorrent after import"
          >
            <Switch
              checked={field.state.value ?? true}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.delete_download_files_after_import">
        {(field) => (
          <SettingRow
            label="Delete Download Data After Import"
            description="Remove downloaded data when torrent cleanup runs"
          >
            <Switch
              checked={field.state.value ?? false}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
