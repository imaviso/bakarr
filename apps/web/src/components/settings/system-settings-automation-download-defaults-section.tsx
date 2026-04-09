import {
  FiniteNumberInput,
  PathMappingsEditor,
  SettingRow,
  SettingSection,
  StringListEditor,
} from "~/components/settings/form-controls";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";

interface SystemSettingsAutomationDownloadDefaultsSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsAutomationDownloadDefaultsSection(
  props: SystemSettingsAutomationDownloadDefaultsSectionProps,
) {
  return (
    <SettingSection title="Global Download Defaults">
      <props.form.Field name="downloads.root_path">
        {(field) => (
          <SettingRow label="Download Path" description="Where downloaded files are saved">
            <Input
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              class="w-64"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.max_size_gb">
        {(field) => (
          <SettingRow label="Max Size" description="Maximum file size for downloads">
            <div class="flex items-center gap-2">
              <FiniteNumberInput
                value={field().state.value}
                onChange={field().handleChange}
                class="w-20"
              />
              <span class="text-xs text-muted-foreground">GB</span>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.create_anime_folders">
        {(field) => (
          <SettingRow label="Create Anime Folders" description="Organize downloads by anime title">
            <Switch
              checked={field().state.value}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.use_seadex">
        {(field) => (
          <SettingRow label="Use SeaDex" description="Prefer SeaDex best releases for scoring">
            <Switch
              checked={field().state.value}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.prefer_dual_audio">
        {(field) => (
          <SettingRow
            label="Prefer Dual Audio"
            description="Boost releases that include dual audio tracks"
          >
            <Switch
              checked={field().state.value}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.preferred_codec">
        {(field) => (
          <SettingRow label="Preferred Codec" description="Optional codec preference for ranking">
            <Input
              value={field().state.value ?? ""}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
              placeholder="HEVC"
              class="w-28"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.preferred_groups">
        {(field) => (
          <SettingRow
            label="Preferred Groups"
            description="One release group per line or comma-separated"
            class="items-start"
          >
            <div class="w-80 space-y-2">
              <StringListEditor
                value={field().state.value}
                onChange={field().handleChange}
                placeholder="SubsPlease\nErai-raws"
                rows={4}
                splitOnComma
              />
              <div class="text-xs text-muted-foreground">
                Used by release ranking and missing-episode search.
              </div>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.remote_path_mappings">
        {(field) => (
          <SettingRow
            label="Remote Path Mappings"
            description="One mapping per line using 'from => to'"
            class="items-start"
          >
            <div class="w-80 space-y-2">
              <PathMappingsEditor
                value={field().state.value}
                onChange={field().handleChange}
                placeholder="/downloads => /mnt/downloads\n/data/torrents => /srv/torrents"
                rows={4}
              />
              <div class="text-xs text-muted-foreground">
                Used when qBittorrent reports a different path than Bakarr can see locally.
              </div>
            </div>
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.reconcile_completed_downloads">
        {(field) => (
          <SettingRow
            label="Auto Reconcile Completed"
            description="Import completed torrents automatically after sync"
          >
            <Switch
              checked={field().state.value ?? true}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.remove_torrent_on_import">
        {(field) => (
          <SettingRow
            label="Remove Torrent On Import"
            description="Delete torrent from qBittorrent after import"
          >
            <Switch
              checked={field().state.value ?? true}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="downloads.delete_download_files_after_import">
        {(field) => (
          <SettingRow
            label="Delete Imported Files"
            description="Remove downloaded data when torrent cleanup runs"
          >
            <Switch
              checked={field().state.value ?? false}
              onChange={(checked) => field().handleChange(checked)}
            />
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
