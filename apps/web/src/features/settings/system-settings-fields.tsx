import { DeepKeysOfType, type DeepValue } from "@tanstack/react-form";

import type { Config } from "@/api/contracts";
import { FiniteNumberInput, SettingRow } from "@/features/settings/form-controls";
import type { SettingsFormApi } from "@/features/settings/system-settings-form-hook";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type StringSettingName = DeepKeysOfType<Config, string | null | undefined>;
type BooleanSettingName = DeepKeysOfType<Config, boolean | undefined>;
type NumberSettingName = DeepKeysOfType<Config, number | undefined>;

interface SettingFieldProps {
  form: SettingsFormApi;
  label: string;
  description?: string | undefined;
  className?: string | undefined;
}

export function SettingTextField(
  props: SettingFieldProps & {
    name: StringSettingName;
    placeholder?: string | undefined;
    type?: "text" | "password" | undefined;
    autoComplete?: string | undefined;
    inputClassName?: string | undefined;
    readOnly?: boolean | undefined;
    /** Commit empty input as null (for optional string columns). */
    emptyAsNull?: boolean | undefined;
  },
) {
  return (
    <props.form.Field name={props.name}>
      {(field) => (
        <SettingRow label={props.label} description={props.description} className={props.className}>
          <Input
            {...(props.type === undefined ? {} : { type: props.type })}
            {...(props.autoComplete === undefined ? {} : { autoComplete: props.autoComplete })}
            {...(props.readOnly === undefined ? {} : { readOnly: props.readOnly })}
            {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
            {...(props.inputClassName === undefined ? {} : { className: props.inputClassName })}
            value={field.state.value ?? ""}
            onInput={(event) =>
              field.handleChange(
                props.emptyAsNull && event.currentTarget.value === ""
                  ? null
                  : event.currentTarget.value,
              )
            }
          />
        </SettingRow>
      )}
    </props.form.Field>
  );
}

export function SettingSwitchField(
  props: SettingFieldProps & {
    name: BooleanSettingName;
    /** Display fallback when the stored value is unset. */
    defaultChecked?: boolean | undefined;
  },
) {
  return (
    <props.form.Field name={props.name}>
      {(field) => (
        <SettingRow label={props.label} description={props.description} className={props.className}>
          <Switch
            isSelected={field.state.value ?? props.defaultChecked ?? false}
            onChange={(checked) => field.handleChange(checked)}
          />
        </SettingRow>
      )}
    </props.form.Field>
  );
}

export function SettingNumberField(
  props: SettingFieldProps & {
    name: NumberSettingName;
    min?: number | string | undefined;
    max?: number | string | undefined;
    fallbackValue?: number | undefined;
    suffix?: string | undefined;
    inputClassName?: string | undefined;
  },
) {
  return (
    <props.form.Field name={props.name}>
      {(field) => (
        <SettingRow label={props.label} description={props.description} className={props.className}>
          <div className="flex items-center gap-2">
            <FiniteNumberInput
              {...(props.min === undefined ? {} : { min: props.min })}
              {...(props.max === undefined ? {} : { max: props.max })}
              {...(props.fallbackValue === undefined ? {} : { fallbackValue: props.fallbackValue })}
              value={field.state.value}
              onChange={field.handleChange}
              className={props.inputClassName ?? "w-20"}
            />
            {props.suffix !== undefined && (
              <span className="text-xs text-muted-foreground">{props.suffix}</span>
            )}
          </div>
        </SettingRow>
      )}
    </props.form.Field>
  );
}

export function SettingSelectField<TName extends DeepKeysOfType<Config, string | null | undefined>>(
  props: SettingFieldProps & {
    name: TName;
    options: readonly Extract<DeepValue<Config, TName>, string>[];
    formatLabel?: ((option: Extract<DeepValue<Config, TName>, string>) => string) | undefined;
    selectClassName?: string | undefined;
  },
) {
  return (
    <props.form.Field name={props.name}>
      {(field) => (
        <SettingRow label={props.label} description={props.description} className={props.className}>
          <Select
            selectedKey={typeof field.state.value === "string" ? field.state.value : null}
            onSelectionChange={(value) => {
              if (value === null) {
                return;
              }
              const selected = String(value);
              const match = props.options.find((option) => option === selected);
              if (match !== undefined) {
                field.handleChange(match);
              }
            }}
          >
            <SelectTrigger className={props.selectClassName ?? "w-32"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.options.map((option) => (
                <SelectItem key={option} id={option} textValue={option}>
                  {props.formatLabel ? props.formatLabel(option) : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      )}
    </props.form.Field>
  );
}
