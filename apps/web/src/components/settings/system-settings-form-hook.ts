import { useForm } from "@tanstack/react-form";
import { ConfigSchema } from "~/components/settings/system-settings-schema";
import type { Config } from "~/lib/api";

interface UseSystemSettingsFormOptions {
  defaultValues: Config;
  onSubmit: (values: Config) => void;
}

export function useSystemSettingsForm(options: UseSystemSettingsFormOptions) {
  return useForm({
    defaultValues: options.defaultValues,
    validators: {
      onChange: ConfigSchema,
    },
    onSubmit: ({ value }) => {
      options.onSubmit(value);
    },
  });
}

export type SettingsFormApi = ReturnType<typeof useSystemSettingsForm>;
