import { SystemSettingsGeneralApplicationSection } from "~/features/settings/system-settings-general-application-section";
import type { SettingsFormApi } from "~/features/settings/system-settings-form-hook";
import { SystemSettingsGeneralLibrarySection } from "~/features/settings/system-settings-general-library-section";
import { SystemSettingsGeneralNamingSection } from "~/features/settings/system-settings-general-naming-section";

interface SystemSettingsGeneralSectionsProps {
  form: SettingsFormApi;
}

export function SystemSettingsGeneralSections(props: SystemSettingsGeneralSectionsProps) {
  return (
    <>
      <SystemSettingsGeneralApplicationSection form={props.form} />
      <SystemSettingsGeneralLibrarySection form={props.form} />
      <SystemSettingsGeneralNamingSection form={props.form} />
    </>
  );
}
