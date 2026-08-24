import { SettingRow, SettingSection } from "@/features/settings/form-controls";
import type { SettingsFormApi } from "@/features/settings/system-settings-form-hook";
import {
  SettingNumberField,
  SettingSwitchField,
  SettingTextField,
} from "@/features/settings/system-settings-fields";
import { Badge } from "@/components/ui/badge";
import type { SystemStatus } from "@/api/contracts";

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
        {props.systemStatus ? (
          <Badge
            variant={props.systemStatus.metadata_providers.anidb.enabled ? "secondary" : "outline"}
          >
            {props.systemStatus.metadata_providers.anidb.enabled
              ? props.systemStatus.metadata_providers.anidb.configured
                ? "Enabled"
                : "Missing credentials"
              : "Disabled"}
          </Badge>
        ) : (
          <Badge variant="outline">Unknown</Badge>
        )}
      </SettingRow>

      <SettingRow
        label="Jikan Runtime Status"
        description="MyMediaList metadata enrichment via Jikan API"
      >
        {props.systemStatus ? (
          <Badge
            variant={props.systemStatus.metadata_providers.jikan.enabled ? "secondary" : "outline"}
          >
            {props.systemStatus.metadata_providers.jikan.enabled
              ? props.systemStatus.metadata_providers.jikan.configured
                ? "Enabled"
                : "Misconfigured"
              : "Disabled"}
          </Badge>
        ) : (
          <Badge variant="outline">Unknown</Badge>
        )}
      </SettingRow>

      <SettingRow
        label="Manami Runtime Status"
        description="Cross-service relation resolution via anime-offline-database"
      >
        {props.systemStatus ? (
          <Badge
            variant={props.systemStatus.metadata_providers.manami.enabled ? "secondary" : "outline"}
          >
            {props.systemStatus.metadata_providers.manami.enabled
              ? props.systemStatus.metadata_providers.manami.configured
                ? "Enabled"
                : "Misconfigured"
              : "Disabled"}
          </Badge>
        ) : (
          <Badge variant="outline">Unknown</Badge>
        )}
      </SettingRow>

      <SettingSwitchField
        form={props.form}
        name="metadata.anidb.enabled"
        label="Enable AniDB MediaUnit Metadata"
        description="Use AniDB UDP API to enrich AniList metadata with episode titles and dates"
      />

      <SettingTextField
        form={props.form}
        name="metadata.anidb.username"
        label="AniDB Username"
        autoComplete="off"
        inputClassName="w-40"
      />

      <SettingTextField
        form={props.form}
        name="metadata.anidb.password"
        label="AniDB Password"
        type="password"
        autoComplete="off"
        inputClassName="w-40"
      />

      <SettingTextField
        form={props.form}
        name="metadata.anidb.client"
        label="AniDB Client Name"
        description="4-16 lowercase letters"
        inputClassName="w-32"
      />

      <SettingNumberField
        form={props.form}
        name="metadata.anidb.client_version"
        label="AniDB Client Version"
        min="1"
        fallbackValue={1}
      />

      <SettingNumberField
        form={props.form}
        name="metadata.anidb.local_port"
        label="AniDB Local UDP Port"
        min="1025"
        max="65535"
        fallbackValue={45553}
        inputClassName="w-24"
      />

      <SettingNumberField
        form={props.form}
        name="metadata.anidb.episode_limit"
        label="AniDB MediaUnit Lookup Limit"
        description="Maximum episode count fetched per anime during refresh"
        min="1"
        fallbackValue={200}
      />
    </SettingSection>
  );
}
