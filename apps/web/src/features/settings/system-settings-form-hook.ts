import { useForm } from "@tanstack/react-form";
import { ConfigSchema } from "@bakarr/shared";
import { Schema } from "effect";
import type { Config } from "~/api";
import type { StandardSchemaV1 } from "@standard-schema/spec";

interface UseSystemSettingsFormOptions {
  defaultValues: Config;
  onSubmit: (values: Config) => void;
}

export function useSystemSettingsForm(options: UseSystemSettingsFormOptions) {
  return useForm({
    defaultValues: options.defaultValues,
    validators: {
      onChange: Schema.standardSchemaV1(ConfigSchema) as StandardSchemaV1<Config, unknown>,
    },
    onSubmit: ({ value }) => {
      options.onSubmit(value);
    },
  });
}

export type SettingsFormApi = ReturnType<typeof useSystemSettingsForm>;
