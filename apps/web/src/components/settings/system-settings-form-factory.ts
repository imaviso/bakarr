import { createForm } from "@tanstack/solid-form";
import { ConfigSchema } from "~/components/settings/system-settings-schema";
import type { Config } from "~/lib/api";

interface CreateSystemSettingsFormOptions {
  defaultValues: Config;
  onSubmit: (values: Config) => void;
}

export function createSystemSettingsForm(options: CreateSystemSettingsFormOptions) {
  return createForm(() => ({
    defaultValues: options.defaultValues,
    validators: {
      onChange: ConfigSchema,
    },
    onSubmit: ({ value }) => {
      options.onSubmit(value);
    },
  }));
}

export type SettingsFormApi = ReturnType<typeof createSystemSettingsForm>;
