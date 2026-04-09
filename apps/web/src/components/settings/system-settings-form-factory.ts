import { createForm } from "@tanstack/solid-form";
import { ConfigSchema } from "~/components/settings/system-settings-schema";
import type { Config } from "~/lib/api";

interface CreateSystemSettingsFormOptions {
  defaultValues: Config;
  onSubmit: (values: Config) => Promise<void>;
}

export function createSystemSettingsForm(options: CreateSystemSettingsFormOptions) {
  return createForm(() => ({
    defaultValues: options.defaultValues,
    validators: {
      onChange: ConfigSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      await options.onSubmit(value);
      formApi.reset(value);
    },
  }));
}

export type SettingsFormApi = ReturnType<typeof createSystemSettingsForm>;
