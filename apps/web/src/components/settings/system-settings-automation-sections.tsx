import type { Accessor } from "solid-js";
import { Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import {
  PathMappingsEditor,
  SettingRow,
  SettingSection,
  StringListEditor,
} from "~/components/settings/form-controls";
import { formatLastRun } from "~/components/settings/system-settings-schema";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { handleFiniteNumberInput } from "~/components/settings/system-settings-utils";
import type { SystemStatus } from "~/lib/api";

interface SystemSettingsAutomationSectionsProps {
  form: SettingsFormApi;
  onTriggerMetadataRefresh: () => void;
  onTriggerRss: () => void;
  onTriggerScan: () => void;
  systemStatus: Accessor<SystemStatus | undefined>;
  triggerMetadataRefreshPending: boolean;
  triggerRssPending: boolean;
  triggerScanPending: boolean;
}

export function SystemSettingsAutomationSections(props: SystemSettingsAutomationSectionsProps) {
  return (
    <>
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

      <SettingSection title="Metadata Providers">
        <SettingRow label="AniDB Runtime Status" description="Live status from /api/system/status">
          <Show when={props.systemStatus()} fallback={<Badge variant="outline">Unknown</Badge>}>
            {(status) => (
              <Badge variant={status().metadata_providers.anidb.enabled ? "secondary" : "outline"}>
                {status().metadata_providers.anidb.enabled
                  ? status().metadata_providers.anidb.configured
                    ? "Enabled"
                    : "Missing credentials"
                  : "Disabled"}
              </Badge>
            )}
          </Show>
        </SettingRow>

        <props.form.Field name="metadata.anidb.enabled">
          {(field) => (
            <SettingRow
              label="Enable AniDB Episode Metadata"
              description="Use AniDB UDP API to enrich AniList metadata with episode titles and dates"
            >
              <Switch
                checked={Boolean(field().state.value)}
                onChange={(checked) => field().handleChange(checked)}
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="metadata.anidb.username">
          {(field) => (
            <SettingRow label="AniDB Username">
              <Input
                value={field().state.value ?? ""}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                autocomplete="off"
                class="w-40"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="metadata.anidb.password">
          {(field) => (
            <SettingRow label="AniDB Password">
              <Input
                type="password"
                value={field().state.value ?? ""}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                autocomplete="off"
                class="w-40"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="metadata.anidb.client">
          {(field) => (
            <SettingRow label="AniDB Client Name" description="4-16 lowercase letters">
              <Input
                value={field().state.value ?? ""}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                class="w-32"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="metadata.anidb.client_version">
          {(field) => (
            <SettingRow label="AniDB Client Version">
              <Input
                type="number"
                min="1"
                value={(field().state.value ?? 1).toString()}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                class="w-20"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="metadata.anidb.local_port">
          {(field) => (
            <SettingRow label="AniDB Local UDP Port">
              <Input
                type="number"
                min="1025"
                max="65535"
                value={(field().state.value ?? 45553).toString()}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                class="w-24"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="metadata.anidb.episode_limit">
          {(field) => (
            <SettingRow
              label="AniDB Episode Lookup Limit"
              description="Maximum episode count fetched per anime during refresh"
            >
              <Input
                type="number"
                min="1"
                value={(field().state.value ?? 200).toString()}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                class="w-20"
              />
            </SettingRow>
          )}
        </props.form.Field>
      </SettingSection>

      <SettingSection title="Scheduler">
        <props.form.Field name="scheduler.enabled">
          {(field) => (
            <SettingRow label="Enable Scheduler" description="Run automated background tasks">
              <Switch
                checked={field().state.value}
                onChange={(checked) => field().handleChange(checked)}
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="scheduler.check_interval_minutes">
          {(field) => (
            <SettingRow label="Check Interval" description="Minutes between RSS checks">
              <div class="flex items-center gap-2">
                <Input
                  type="number"
                  value={field().state.value.toString()}
                  onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                  class="w-20"
                />
                <span class="text-xs text-muted-foreground">min</span>
              </div>
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="scheduler.max_concurrent_checks">
          {(field) => (
            <SettingRow label="Max Concurrent Checks" description="Parallel anime checks">
              <Input
                type="number"
                value={field().state.value.toString()}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                class="w-20"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="scheduler.check_delay_seconds">
          {(field) => (
            <SettingRow
              label="Check Delay"
              description="Delay between consecutive automated checks"
            >
              <div class="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={field().state.value.toString()}
                  onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                  class="w-20"
                />
                <span class="text-xs text-muted-foreground">sec</span>
              </div>
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="scheduler.metadata_refresh_hours">
          {(field) => (
            <SettingRow label="Metadata Refresh" description="Hours between metadata updates">
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

        <props.form.Field name="scheduler.cron_expression">
          {(field) => (
            <SettingRow label="Cron Expression" description="Custom schedule (overrides interval)">
              <Input
                value={field().state.value || ""}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                placeholder="0 */6 * * *"
                class="w-36 font-mono text-xs"
              />
            </SettingRow>
          )}
        </props.form.Field>
      </SettingSection>

      <SettingSection title="Tasks">
        <SettingRow
          label="Library Scan"
          description={`Last run: ${formatLastRun(props.systemStatus()?.last_scan)}`}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onTriggerScan}
            disabled={props.triggerScanPending}
          >
            {props.triggerScanPending ? "Running..." : "Run Now"}
          </Button>
        </SettingRow>

        <SettingRow
          label="RSS Check"
          description={`Last run: ${formatLastRun(props.systemStatus()?.last_rss)}`}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onTriggerRss}
            disabled={props.triggerRssPending}
          >
            {props.triggerRssPending ? "Running..." : "Run Now"}
          </Button>
        </SettingRow>

        <SettingRow label="Metadata Refresh" description="Refresh anime metadata from AniList">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onTriggerMetadataRefresh}
            disabled={props.triggerMetadataRefreshPending}
          >
            {props.triggerMetadataRefreshPending ? "Running..." : "Run Now"}
          </Button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Indexer">
        <props.form.Field name="nyaa.base_url">
          {(field) => (
            <SettingRow label="Nyaa URL" description="Base URL for Nyaa.si">
              <Input
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                placeholder="https://nyaa.si"
                class="w-48"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="nyaa.min_seeders">
          {(field) => (
            <SettingRow label="Minimum Seeders" description="Skip releases with fewer seeders">
              <Input
                type="number"
                value={field().state.value.toString()}
                onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                class="w-20"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="nyaa.default_category">
          {(field) => (
            <SettingRow
              label="Default Category"
              description="Default Nyaa category code for searches"
            >
              <Input
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                placeholder="1_2"
                class="w-24"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="nyaa.preferred_resolution">
          {(field) => (
            <SettingRow
              label="Preferred Resolution"
              description="Optional hint for ranking search results"
            >
              <Input
                value={field().state.value ?? ""}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                placeholder="1080p"
                class="w-24"
              />
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="nyaa.filter_remakes">
          {(field) => (
            <SettingRow label="Filter Remakes" description="Exclude remakes from search results">
              <Switch
                checked={field().state.value}
                onChange={(checked) => field().handleChange(checked)}
              />
            </SettingRow>
          )}
        </props.form.Field>
      </SettingSection>

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
                <Input
                  type="number"
                  value={field().state.value.toString()}
                  onInput={(event) => handleFiniteNumberInput(event, field().handleChange)}
                  class="w-20"
                />
                <span class="text-xs text-muted-foreground">GB</span>
              </div>
            </SettingRow>
          )}
        </props.form.Field>

        <props.form.Field name="downloads.create_anime_folders">
          {(field) => (
            <SettingRow
              label="Create Anime Folders"
              description="Organize downloads by anime title"
            >
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
    </>
  );
}
