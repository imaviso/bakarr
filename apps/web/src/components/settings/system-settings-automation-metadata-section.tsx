import { Show } from "solid-js";
import { FiniteNumberInput, SettingRow, SettingSection } from "~/components/settings/form-controls";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import type { SystemStatus } from "~/lib/api";

interface SystemSettingsAutomationMetadataSectionProps {
  form: SettingsFormApi;
  systemStatus: SystemStatus | undefined;
}

export function SystemSettingsAutomationMetadataSection(
  props: SystemSettingsAutomationMetadataSectionProps,
) {
  return (
    <SettingSection title="Metadata Providers">
      <SettingRow label="AniDB Runtime Status" description="Live status from /api/system/status">
        <Show when={props.systemStatus} fallback={<Badge variant="outline">Unknown</Badge>}>
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

      <SettingRow
        label="Jikan Runtime Status"
        description="MyAnimeList metadata enrichment via Jikan API"
      >
        <Show when={props.systemStatus} fallback={<Badge variant="outline">Unknown</Badge>}>
          {(status) => (
            <Badge variant={status().metadata_providers.jikan.enabled ? "secondary" : "outline"}>
              {status().metadata_providers.jikan.enabled
                ? status().metadata_providers.jikan.configured
                  ? "Enabled"
                  : "Misconfigured"
                : "Disabled"}
            </Badge>
          )}
        </Show>
      </SettingRow>

      <SettingRow
        label="Manami Runtime Status"
        description="Cross-service relation resolution via anime-offline-database"
      >
        <Show when={props.systemStatus} fallback={<Badge variant="outline">Unknown</Badge>}>
          {(status) => (
            <Badge variant={status().metadata_providers.manami.enabled ? "secondary" : "outline"}>
              {status().metadata_providers.manami.enabled
                ? status().metadata_providers.manami.configured
                  ? "Enabled"
                  : "Misconfigured"
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
            <FiniteNumberInput
              min="1"
              value={field().state.value}
              fallbackValue={1}
              onChange={field().handleChange}
              class="w-20"
            />
          </SettingRow>
        )}
      </props.form.Field>

      <props.form.Field name="metadata.anidb.local_port">
        {(field) => (
          <SettingRow label="AniDB Local UDP Port">
            <FiniteNumberInput
              min="1025"
              max="65535"
              value={field().state.value}
              fallbackValue={45553}
              onChange={field().handleChange}
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
            <FiniteNumberInput
              min="1"
              value={field().state.value}
              fallbackValue={200}
              onChange={field().handleChange}
              class="w-20"
            />
          </SettingRow>
        )}
      </props.form.Field>
    </SettingSection>
  );
}
