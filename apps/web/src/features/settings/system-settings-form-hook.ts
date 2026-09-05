import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { ConfigSchema } from "@bakarr/shared";
import { Schema } from "effect";
import { fieldErrorMessage } from "@/api/effect/errors";
import type { Config } from "@/api/contracts";

interface UseSystemSettingsFormOptions {
  defaultValues: Config;
  onSubmit: (values: Config) => void;
}

function firstFormErrorMessage(formApi: {
  state: { errors: unknown[]; fieldMeta: Record<string, { errors: unknown[] } | undefined> };
}) {
  for (const fieldMeta of Object.values(formApi.state.fieldMeta)) {
    const error = fieldMeta?.errors[0];
    if (error !== undefined) return fieldErrorMessage(error);
  }
  const formError = formApi.state.errors[0];
  return formError === undefined ? undefined : fieldErrorMessage(formError);
}

export function useSystemSettingsForm(options: UseSystemSettingsFormOptions) {
  return useForm({
    defaultValues: options.defaultValues,
    validators: {
      onSubmit: Schema.toStandardSchemaV1(ConfigSchema),
    },
    onSubmit: ({ value }) => {
      options.onSubmit(value);
    },
    onSubmitInvalid: ({ formApi }) => {
      toast.error(firstFormErrorMessage(formApi) ?? "Fix invalid fields before saving");
    },
  });
}

export type SettingsFormApi = ReturnType<typeof useSystemSettingsForm>;
