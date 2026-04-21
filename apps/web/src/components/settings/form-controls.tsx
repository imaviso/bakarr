import { useState, type ReactNode } from "react";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

function parseSizeUnit(value: string | null | undefined): "MB" | "GB" | undefined {
  if (value === "MB" || value === "mb") {
    return "MB";
  }
  if (value === "GB" || value === "gb") {
    return "GB";
  }
  return undefined;
}

function parseSize(value: string): { amount: string; unit: "MB" | "GB" } {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
  if (!match) return { amount: "", unit: "MB" };
  const unit = parseSizeUnit(match[2]);
  return { amount: match[1] ?? "", unit: unit ?? "MB" };
}

export function SizeInput(props: {
  error?: string | undefined;
  label: string;
  onChange: (value: string | undefined) => void;
  value: string;
}) {
  const parsed = parseSize(props.value);
  const [isFocused, setIsFocused] = useState(false);
  const [draftAmount, setDraftAmount] = useState(parsed.amount);
  const [draftUnit, setDraftUnit] = useState<"MB" | "GB">(parsed.unit);

  const displayAmount = isFocused ? draftAmount : parsed.amount;
  const displayUnit = isFocused ? draftUnit : parsed.unit;

  const commit = (amount: string, unit: "MB" | "GB") => {
    const numeric = Number(amount);
    if (amount && !Number.isNaN(numeric) && numeric > 0) {
      props.onChange(`${amount} ${unit}`);
      return;
    }
    props.onChange(undefined);
  };

  const inputId = `size-input-${props.label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {props.label}
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="number"
          min="0"
          step="0.1"
          value={displayAmount}
          onFocus={() => {
            setIsFocused(true);
            setDraftAmount(parsed.amount);
            setDraftUnit(parsed.unit);
          }}
          onInput={(event) => {
            const nextAmount = event.currentTarget.value;
            setDraftAmount(nextAmount);
            commit(nextAmount, draftUnit);
          }}
          onBlur={() => setIsFocused(false)}
          placeholder="0"
          className="flex-1"
        />
        <Select
          value={displayUnit}
          onValueChange={(value) => {
            const parsedUnit = parseSizeUnit(value);
            if (parsedUnit === undefined) {
              return;
            }
            setDraftUnit(parsedUnit);
            commit(isFocused ? draftAmount : parsed.amount, parsedUnit);
          }}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MB">MB</SelectItem>
            <SelectItem value="GB">GB</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {props.error && <div className="text-[0.8rem] text-destructive">{props.error}</div>}
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

export function FiniteNumberInput(props: {
  className?: string;
  fallbackValue?: number;
  max?: number | string;
  min?: number | string;
  onChange: (value: number) => void;
  step?: number | string;
  value: number | undefined;
}) {
  const displayValue = String(props.value ?? props.fallbackValue ?? 0);
  const [text, setText] = useState(displayValue);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Input
      type="number"
      {...(props.min === undefined ? {} : { min: props.min })}
      {...(props.max === undefined ? {} : { max: props.max })}
      {...(props.step === undefined ? {} : { step: props.step })}
      value={isFocused ? text : displayValue}
      onFocus={() => {
        setIsFocused(true);
        setText(displayValue);
      }}
      onInput={(event) => {
        const next = event.currentTarget.value;
        setText(next);

        const parsed = parseFiniteNumber(next);
        if (parsed !== undefined) {
          props.onChange(parsed);
        }
      }}
      onBlur={() => {
        setIsFocused(false);

        const parsed = parseFiniteNumber(text);
        if (parsed === undefined) {
          setText(displayValue);
          return;
        }

        props.onChange(parsed);
        setText(String(parsed));
      }}
      className={props.className}
    />
  );
}

export function SettingRow(props: {
  children: ReactNode;
  className?: string;
  description?: string;
  label: string;
}) {
  return (
    <div className={cn("flex items-center justify-between py-3 gap-8", props.className)}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{props.label}</div>
        {props.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{props.description}</div>
        )}
      </div>
      <div className="shrink-0">{props.children}</div>
    </div>
  );
}

export function SettingSection(props: { children: ReactNode; title: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5 mb-3">
        {props.title}
      </div>
      <div className="divide-y divide-border/50">{props.children}</div>
    </div>
  );
}

function formatStringList(values: string[]) {
  return values.join("\n");
}

function parseStringList(value: string, splitOnComma: boolean) {
  const parsed: string[] = [];

  for (const line of value.split(/\n/g)) {
    const items = splitOnComma ? line.split(",") : [line];
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        parsed.push(trimmed);
      }
    }
  }

  return parsed;
}

export function StringListEditor(props: {
  className?: string;
  onChange: (value: string[]) => void;
  placeholder?: string;
  rows?: number;
  splitOnComma?: boolean;
  value: string[];
}) {
  const formatted = formatStringList(props.value);
  const [text, setText] = useState(formatted);
  const [isFocused, setIsFocused] = useState(false);

  const commit = () => {
    props.onChange(parseStringList(text, props.splitOnComma ?? false));
  };

  return (
    <Textarea
      className={props.className}
      value={isFocused ? text : formatted}
      rows={props.rows ?? 4}
      placeholder={props.placeholder}
      onFocus={() => {
        setIsFocused(true);
        setText(formatted);
      }}
      onInput={(event) => setText(event.currentTarget.value)}
      onBlur={() => {
        setIsFocused(false);
        commit();
      }}
    />
  );
}

function formatPathMappings(values: string[][]) {
  return values.map(([from = "", to = ""]) => `${from} => ${to}`).join("\n");
}

function parsePathMappings(value: string) {
  const mappings: [string, string][] = [];

  for (const line of value.split(/\n/g)) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    const [from, ...rest] = trimmedLine.split("=>");
    const mappedFrom = from?.trim() ?? "";
    const mappedTo = rest.join("=>").trim();

    if (mappedFrom.length > 0 && mappedTo.length > 0) {
      mappings.push([mappedFrom, mappedTo]);
    }
  }

  return mappings;
}

export function PathMappingsEditor(props: {
  className?: string;
  onChange: (value: string[][]) => void;
  placeholder?: string;
  rows?: number;
  value: string[][];
}) {
  const formatted = formatPathMappings(props.value);
  const [text, setText] = useState(formatted);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Textarea
      className={props.className}
      value={isFocused ? text : formatted}
      rows={props.rows ?? 4}
      placeholder={props.placeholder}
      onFocus={() => {
        setIsFocused(true);
        setText(formatted);
      }}
      onInput={(event) => setText(event.currentTarget.value)}
      onBlur={() => {
        setIsFocused(false);
        props.onChange(parsePathMappings(text));
      }}
    />
  );
}
