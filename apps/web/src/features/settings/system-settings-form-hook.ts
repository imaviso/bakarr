import { useForm } from "@tanstack/react-form";
import { ConfigSchema } from "@bakarr/shared";
import { Schema } from "effect";
import type { Config } from "~/api/contracts";

interface UseSystemSettingsFormOptions {
  defaultValues: Config;
  onSubmit: (values: Config) => void;
}

export function useSystemSettingsForm(options: UseSystemSettingsFormOptions) {
  return useForm({
    defaultValues: options.defaultValues,
    validators: {
      onChange: Schema.standardSchemaV1(ConfigSchema),
    },
    onSubmit: ({ value }) => {
      options.onSubmit(value);
    },
  });
}

export type SettingsFormApi = ReturnType<typeof useSystemSettingsForm>;
