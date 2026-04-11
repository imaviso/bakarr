import { createEffect, createSignal, Show, type JSX } from "solid-js";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { TextField, TextFieldTextArea } from "~/components/ui/text-field";

function parseSizeUnit(value: string): "MB" | "GB" | undefined {
  if (value === "MB" || value === "mb") {
    return "MB";
  }
  if (value === "GB" || value === "gb") {
    return "GB";
  }
  return undefined;
}

export function SizeInput(props: {
  error?: string | undefined;
  label: string;
  onChange: (value: string | undefined) => void;
  value: string;
}) {
  const [amount, setAmount] = createSignal<string>("");
  const [unit, setUnit] = createSignal<"MB" | "GB">("MB");
  const [isAmountFocused, setIsAmountFocused] = createSignal(false);

  createEffect(() => {
    if (isAmountFocused()) {
      return;
    }

    const match = props.value.match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
    if (!match) {
      if (amount() !== "") {
        setAmount("");
      }
      return;
    }

    const [matchedAmount, matchedUnit] = match.slice(1);
    if (matchedAmount && amount() !== matchedAmount) {
      setAmount(matchedAmount);
    }
    const parsedUnit = matchedUnit ? parseSizeUnit(matchedUnit) : undefined;
    if (parsedUnit && unit() !== parsedUnit) {
      setUnit(parsedUnit);
    }
  });

  const updateValue = (nextAmount = amount(), nextUnit = unit()) => {
    const numericAmount = nextAmount;
    if (numericAmount && !Number.isNaN(Number(numericAmount)) && Number(numericAmount) > 0) {
      props.onChange(`${numericAmount} ${nextUnit}`);
      return;
    }
    props.onChange(undefined);
  };

  const inputId = `size-input-${props.label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div class="flex flex-col gap-1.5">
      <label
        for={inputId}
        class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {props.label}
      </label>
      <div class="flex gap-2">
        <Input
          id={inputId}
          type="number"
          min="0"
          step="0.1"
          value={amount()}
          onFocus={() => setIsAmountFocused(true)}
          onInput={(event) => {
            const nextAmount = event.currentTarget.value;
            setAmount(nextAmount);
            updateValue(nextAmount, unit());
          }}
          onBlur={() => setIsAmountFocused(false)}
          placeholder="0"
          class="flex-1"
        />
        <Select
          value={unit()}
          onChange={(value) => {
            if (value) {
              setUnit(value);
              updateValue(amount(), value);
            }
          }}
          options={["MB", "GB"]}
          itemComponent={(itemProps) => (
            <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
          )}
        >
          <SelectTrigger class="w-20">
            <SelectValue<string>>{(state) => state.selectedOption()}</SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>
      </div>
      <Show when={props.error}>
        <div class="text-[0.8rem] text-destructive">{props.error}</div>
      </Show>
    </div>
  );
}

function parseFiniteNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createBufferedTextState(initialValue: () => string) {
  const [text, setText] = createSignal(initialValue());
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const next = initialValue();
    if (!isFocused() && text() !== next) {
      setText(next);
    }
  });

  return {
    isFocused,
    setIsFocused,
    setText,
    text,
  };
}

export function FiniteNumberInput(props: {
  class?: string;
  fallbackValue?: number;
  max?: number | string;
  min?: number | string;
  onChange: (value: number) => void;
  step?: number | string;
  value: number | undefined;
}) {
  const toDisplayValue = () => String(props.value ?? props.fallbackValue ?? 0);
  const buffered = createBufferedTextState(toDisplayValue);

  return (
    <Input
      type="number"
      {...(props.min === undefined ? {} : { min: props.min })}
      {...(props.max === undefined ? {} : { max: props.max })}
      {...(props.step === undefined ? {} : { step: props.step })}
      value={buffered.text()}
      onFocus={() => buffered.setIsFocused(true)}
      onInput={(event) => {
        const next = event.currentTarget.value;
        buffered.setText(next);

        const parsed = parseFiniteNumber(next);
        if (parsed !== undefined) {
          props.onChange(parsed);
        }
      }}
      onBlur={() => {
        buffered.setIsFocused(false);

        const parsed = parseFiniteNumber(buffered.text());
        if (parsed === undefined) {
          buffered.setText(toDisplayValue());
          return;
        }

        props.onChange(parsed);
        buffered.setText(String(parsed));
      }}
      class={props.class}
    />
  );
}

export function SettingRow(props: {
  children: JSX.Element;
  class?: string;
  description?: string;
  label: string;
}) {
  return (
    <div class={`flex items-center justify-between py-3 gap-8 ${props.class ?? ""}`}>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-foreground">{props.label}</div>
        <Show when={props.description}>
          <div class="text-xs text-muted-foreground mt-0.5">{props.description}</div>
        </Show>
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  );
}

export function SettingSection(props: { children: JSX.Element; title: string }) {
  return (
    <div class="space-y-1">
      <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5 mb-3">
        {props.title}
      </div>
      <div class="divide-y divide-border/50">{props.children}</div>
    </div>
  );
}

function formatStringList(values: string[]) {
  return values.join("\n");
}

function parseStringList(value: string, splitOnComma: boolean) {
  return value
    .split(/\n/g)
    .flatMap((line) => (splitOnComma ? line.split(",") : [line]))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function StringListEditor(props: {
  class?: string;
  onChange: (value: string[]) => void;
  placeholder?: string;
  rows?: number;
  splitOnComma?: boolean;
  value: string[];
}) {
  const buffered = createBufferedTextState(() => formatStringList(props.value));

  const commit = () => {
    props.onChange(parseStringList(buffered.text(), props.splitOnComma ?? false));
  };

  return (
    <TextField class={props.class}>
      <TextFieldTextArea
        value={buffered.text()}
        rows={props.rows ?? 4}
        placeholder={props.placeholder}
        onFocus={() => buffered.setIsFocused(true)}
        onInput={(event) => buffered.setText(event.currentTarget.value)}
        onBlur={() => {
          buffered.setIsFocused(false);
          commit();
        }}
      />
    </TextField>
  );
}

function formatPathMappings(values: string[][]) {
  return values.map(([from = "", to = ""]) => `${from} => ${to}`).join("\n");
}

function parsePathMappings(value: string) {
  return value
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [from, ...rest] = line.split("=>");
      return [from?.trim() ?? "", rest.join("=>").trim()] as [string, string];
    })
    .filter(([from, to]) => from.length > 0 && to.length > 0);
}

export function PathMappingsEditor(props: {
  class?: string;
  onChange: (value: string[][]) => void;
  placeholder?: string;
  rows?: number;
  value: string[][];
}) {
  const buffered = createBufferedTextState(() => formatPathMappings(props.value));

  return (
    <TextField class={props.class}>
      <TextFieldTextArea
        value={buffered.text()}
        rows={props.rows ?? 4}
        placeholder={props.placeholder}
        onFocus={() => buffered.setIsFocused(true)}
        onInput={(event) => buffered.setText(event.currentTarget.value)}
        onBlur={() => {
          buffered.setIsFocused(false);
          props.onChange(parsePathMappings(buffered.text()));
        }}
      />
    </TextField>
  );
}
