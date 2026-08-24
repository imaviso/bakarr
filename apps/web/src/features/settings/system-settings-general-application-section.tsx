import { SettingSection } from "@/features/settings/form-controls";
import type { SettingsFormApi } from "@/features/settings/system-settings-form-hook";
import {
  SettingNumberField,
  SettingSelectField,
  SettingSwitchField,
  SettingTextField,
} from "@/features/settings/system-settings-fields";

const LOG_LEVELS = ["error", "warn", "info", "debug", "trace"] as const;

interface SystemSettingsGeneralApplicationSectionProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralApplicationSection(
  props: SystemSettingsGeneralApplicationSectionProps,
) {
  return (
    <SettingSection title="Application">
      <SettingTextField
        form={props.form}
        name="general.database_path"
        label="Database Path"
        description="Current database file path"
        readOnly
        inputClassName="w-64"
      />

      <SettingSelectField
        form={props.form}
        name="general.log_level"
        label="Log Level"
        description="Control verbosity of application logs"
        options={LOG_LEVELS}
      />

      <SettingTextField
        form={props.form}
        name="general.images_path"
        label="Images Path"
        description="Local cache for cover art and images"
        inputClassName="w-64"
      />

      <SettingNumberField
        form={props.form}
        name="general.worker_threads"
        label="Worker Threads"
        description="Number of threads for background tasks (0 = auto)"
        min="0"
        fallbackValue={2}
        inputClassName="w-24"
      />

      <SettingNumberField
        form={props.form}
        name="general.max_db_connections"
        label="Max DB Connections"
        description="Upper limit for database connections"
        min="1"
        inputClassName="w-24"
      />

      <SettingNumberField
        form={props.form}
        name="general.min_db_connections"
        label="Min DB Connections"
        description="Lower limit for database connections"
        min="1"
        inputClassName="w-24"
      />

      <SettingSwitchField
        form={props.form}
        name="general.suppress_connection_errors"
        label="Suppress Connection Errors"
        description="Hide noisy retry logs from qBittorrent/Network"
      />
    </SettingSection>
  );
}
