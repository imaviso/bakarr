import { Schema } from "effect";
import { PathMappingsEditor, SettingRow, SettingSection } from "@/features/settings/form-controls";
import type { SettingsFormApi } from "@/features/settings/system-settings-form-hook";
import { Input } from "@/components/ui/input";
import { SettingSwitchField, SettingTextField } from "@/features/settings/system-settings-fields";
import { SectionLabel } from "@/components/shared/section-label";

interface SystemSettingsDownloadsSectionProps {
  form: SettingsFormApi;
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
      <SectionLabel className="block px-0.5 pt-4 pb-1">Download Client</SectionLabel>

      <SettingSwitchField
        form={props.form}
        name="qbittorrent.enabled"
        label="Enable qBittorrent"
        description="Connect to qBittorrent for downloading"
      />

      <SettingTextField
        form={props.form}
        name="qbittorrent.url"
        label="URL"
        description="qBittorrent Web UI address"
        placeholder="http://localhost:8080"
        inputClassName="w-56"
      />

      <SettingTextField
        form={props.form}
        name="qbittorrent.username"
        label="Username"
        autoComplete="off"
        inputClassName="w-40"
      />

      <SettingTextField
        form={props.form}
        name="qbittorrent.password"
        label="Password"
        type="password"
        autoComplete="off"
        inputClassName="w-40"
      />

      <SettingTextField
        form={props.form}
        name="qbittorrent.default_category"
        label="Category"
        description="qBittorrent category for downloads"
        placeholder="bakarr"
        inputClassName="w-32"
      />

      <SettingTextField
        form={props.form}
        name="qbittorrent.save_path"
        label="Save Path"
        description="qBittorrent download folder for newly added torrents"
        placeholder="/downloads/media"
        inputClassName="w-64"
        emptyAsNull
      />

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

      <SettingSwitchField
        form={props.form}
        name="rtorrent.enabled"
        label="Enable rTorrent"
        description="Connect to rTorrent over SCGI for downloading"
      />

      <SettingTextField
        form={props.form}
        name="rtorrent.url"
        label="rTorrent SCGI URL"
        description="scgi://host:port, scgi:///path/to/rpc.sock, or a proxied http(s) endpoint"
        placeholder="scgi://localhost:5000"
        inputClassName="w-64"
      />

      <SettingTextField
        form={props.form}
        name="rtorrent.save_path"
        label="rTorrent Save Path"
        description="Download folder for newly added torrents"
        placeholder="/downloads/media"
        inputClassName="w-64"
        emptyAsNull
      />

      <SectionLabel className="block px-0.5 pt-4 pb-1">Import Defaults</SectionLabel>

      <SettingTextField
        form={props.form}
        name="downloads.root_path"
        label="Download Path"
        description="Folder Bakarr watches for completed downloads"
        inputClassName="w-64"
      />

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

      <SettingSwitchField
        form={props.form}
        name="downloads.create_media_folders"
        label="Create Media Folders"
        description="Group downloaded files by title before import"
      />

      <SettingSwitchField
        form={props.form}
        name="downloads.reconcile_completed_downloads"
        label="Import Completed Torrents"
        description="Automatically import finished qBittorrent downloads"
        defaultChecked
      />

      <SettingSwitchField
        form={props.form}
        name="downloads.remove_torrent_on_import"
        label="Remove Torrent After Import"
        description="Delete torrent from qBittorrent after import"
        defaultChecked
      />

      <SettingSwitchField
        form={props.form}
        name="downloads.delete_download_files_after_import"
        label="Delete Download Data After Import"
        description="Remove downloaded data when torrent cleanup runs"
      />
    </SettingSection>
  );
}
