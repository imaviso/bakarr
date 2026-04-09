import { SystemSettingsGeneralApplicationSection } from "~/components/settings/system-settings-general-application-section";
import type { SettingsFormApi } from "~/components/settings/system-settings-form-factory";
import { SystemSettingsGeneralLibrarySection } from "~/components/settings/system-settings-general-library-section";
import { SystemSettingsGeneralNamingSection } from "~/components/settings/system-settings-general-naming-section";

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
