import { useEffect, useState, type ReactNode } from "react";
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

function parseSizeUnit(value: string | null): "MB" | "GB" | undefined {
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
  const [sizeValue, setSizeValue] = useState<{ amount: string; unit: "MB" | "GB" }>({
    amount: "",
    unit: "MB",
  });
  const [isAmountFocused, setIsAmountFocused] = useState(false);

  const amount = sizeValue.amount;
  const unit = sizeValue.unit;

  useEffect(() => {
    let nextSizeValue: { amount: string; unit: "MB" | "GB" } | null = null;

    if (isAmountFocused) {
      return;
    }

    const match = props.value.match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
    if (!match) {
      if (amount !== "") {
        nextSizeValue = {
          amount: "",
          unit,
        };
      }

      if (nextSizeValue !== null) {
        setSizeValue(nextSizeValue);
      }
      return;
    }

    const [matchedAmount, matchedUnit] = match.slice(1);
    const parsedUnit = matchedUnit ? parseSizeUnit(matchedUnit) : undefined;

    if (!matchedAmount || !parsedUnit) {
      return;
    }

    if (amount !== matchedAmount || unit !== parsedUnit) {
      nextSizeValue = {
        amount: matchedAmount,
        unit: parsedUnit,
      };
    }

    if (nextSizeValue !== null) {
      setSizeValue(nextSizeValue);
    }
  }, [props.value, isAmountFocused, amount, unit]);

  const updateValue = (nextAmount = amount, nextUnit = unit) => {
    const numericAmount = nextAmount;
    if (numericAmount && !Number.isNaN(Number(numericAmount)) && Number(numericAmount) > 0) {
      props.onChange(`${numericAmount} ${nextUnit}`);
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
          value={amount}
          onFocus={() => setIsAmountFocused(true)}
          onInput={(event) => {
            const nextAmount = event.currentTarget.value;
            setSizeValue((prev) => ({
              ...prev,
              amount: nextAmount,
            }));
            updateValue(nextAmount, unit);
          }}
          onBlur={() => setIsAmountFocused(false)}
          placeholder="0"
          className="flex-1"
        />
        <Select
          value={unit}
          onValueChange={(value) => {
            const parsedUnit = parseSizeUnit(value);
            if (parsedUnit === undefined) {
              return;
            }
            setSizeValue((prev) => ({
              ...prev,
              unit: parsedUnit,
            }));
            updateValue(amount, parsedUnit);
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

function useBufferedTextState(value: string) {
  const [text, setText] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused && text !== value) {
      setText(value);
    }
  }, [value, isFocused, text]);

  return {
    isFocused,
    setIsFocused,
    setText,
    text,
  };
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
  const buffered = useBufferedTextState(displayValue);

  return (
    <Input
      type="number"
      {...(props.min === undefined ? {} : { min: props.min })}
      {...(props.max === undefined ? {} : { max: props.max })}
      {...(props.step === undefined ? {} : { step: props.step })}
      value={buffered.text}
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

        const parsed = parseFiniteNumber(buffered.text);
        if (parsed === undefined) {
          buffered.setText(displayValue);
          return;
        }

        props.onChange(parsed);
        buffered.setText(String(parsed));
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
  const buffered = useBufferedTextState(formatStringList(props.value));

  const commit = () => {
    props.onChange(parseStringList(buffered.text, props.splitOnComma ?? false));
  };

  return (
    <Textarea
      className={props.className}
      value={buffered.text}
      rows={props.rows ?? 4}
      placeholder={props.placeholder}
      onFocus={() => buffered.setIsFocused(true)}
      onInput={(event) => buffered.setText(event.currentTarget.value)}
      onBlur={() => {
        buffered.setIsFocused(false);
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
  const buffered = useBufferedTextState(formatPathMappings(props.value));

  return (
    <Textarea
      className={props.className}
      value={buffered.text}
      rows={props.rows ?? 4}
      placeholder={props.placeholder}
      onFocus={() => buffered.setIsFocused(true)}
      onInput={(event) => buffered.setText(event.currentTarget.value)}
      onBlur={() => {
        buffered.setIsFocused(false);
        props.onChange(parsePathMappings(buffered.text));
      }}
    />
  );
}
