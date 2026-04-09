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

  createEffect(() => {
    const match = props.value.match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
    if (!match) {
      if (amount() !== "") {
        setAmount("");
      }
      setUnit("MB");
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
          onInput={(event) => {
            const nextAmount = event.currentTarget.value;
            setAmount(nextAmount);
            updateValue(nextAmount, unit());
          }}
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
      {props.error && <div class="text-[0.8rem] text-destructive">{props.error}</div>}
    </div>
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
  const [text, setText] = createSignal(formatStringList(props.value));
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const next = formatStringList(props.value);
    if (!isFocused() && text() !== next) {
      setText(next);
    }
  });

  const commit = () => {
    props.onChange(parseStringList(text(), props.splitOnComma ?? false));
  };

  return (
    <TextField class={props.class}>
      <TextFieldTextArea
        value={text()}
        rows={props.rows ?? 4}
        placeholder={props.placeholder}
        onFocus={() => setIsFocused(true)}
        onInput={(event) => setText(event.currentTarget.value)}
        onBlur={() => {
          setIsFocused(false);
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
  const [text, setText] = createSignal(formatPathMappings(props.value));
  const [isFocused, setIsFocused] = createSignal(false);

  createEffect(() => {
    const next = formatPathMappings(props.value);
    if (!isFocused() && text() !== next) {
      setText(next);
    }
  });

  return (
    <TextField class={props.class}>
      <TextFieldTextArea
        value={text()}
        rows={props.rows ?? 4}
        placeholder={props.placeholder}
        onFocus={() => setIsFocused(true)}
        onInput={(event) => setText(event.currentTarget.value)}
        onBlur={() => {
          setIsFocused(false);
          props.onChange(parsePathMappings(text()));
        }}
      />
    </TextField>
  );
}
