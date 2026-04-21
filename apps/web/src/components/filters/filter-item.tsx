import { XIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { useFilterContext } from "./filter-context";
import type { FilterOperator, FilterState } from "./types";

interface FilterItemProps {
  filter: FilterState;
}

export function FilterItem(props: FilterItemProps) {
  const ctx = useFilterContext();

  const column = useMemo(
    () => ctx.columns.find((c) => c.id === props.filter.columnId),
    [ctx.columns, props.filter.columnId],
  );

  const operatorOptions = useMemo(() => {
    const col = column;
    if (!col) return [];

    let options: { value: FilterOperator; label: string }[] = [];

    switch (col.type) {
      case "text":
        options = [
          { value: "contains", label: "contains" },
          { value: "does_not_contain", label: "does not contain" },
        ];
        break;
      case "select":
        options = [
          { value: "is", label: "is" },
          { value: "is_not", label: "is not" },
        ];
        break;
      case "multiSelect":
        options = [
          { value: "is_any_of", label: "is any of" },
          { value: "is_none_of", label: "is none of" },
        ];
        break;
      case "date":
        options = [
          { value: "is", label: "is" },
          { value: "is_before", label: "is before" },
          { value: "is_after", label: "is after" },
        ];
        break;
      default:
        options = [];
    }

    if (col.operators && col.operators.length > 0) {
      return options.filter((o) => col.operators?.includes(o.value));
    }

    return options;
  }, [column]);

  const handleOperatorChange = (operator: FilterOperator | null) => {
    if (operator) {
      ctx.updateFilter(props.filter.id, { operator });
    }
  };

  const handleValueChange = (value: string | string[] | null) => {
    if (value !== null) {
      ctx.updateFilter(props.filter.id, { value });
    }
  };

  return (
    <div className="flex items-center gap-1.5 bg-muted rounded-none p-1 pr-2">
      <div className="text-sm font-medium text-muted-foreground px-2">{column?.label}</div>

      <Select
        value={props.filter.operator}
        onValueChange={(value) => {
          const matchedOperator = operatorOptions.find((option) => option.value === value)?.value;
          handleOperatorChange(matchedOperator ?? null);
        }}
      >
        <SelectTrigger className="w-[140px] h-8 px-2 bg-background focus:ring-0 focus:ring-offset-0 border-muted-foreground/20">
          <SelectValue placeholder="Select operator" />
        </SelectTrigger>
        <SelectContent>
          {operatorOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {column?.type === "text" || column?.type === "date" ? (
        <Input
          type={column?.type === "date" ? "date" : "text"}
          value={
            Array.isArray(props.filter.value) ? props.filter.value[0] || "" : props.filter.value
          }
          onChange={(event) => handleValueChange(event.currentTarget.value)}
          placeholder={column?.placeholder || "Enter value"}
          className="h-8 w-[160px] px-2 bg-background focus-visible:ring-0 focus-visible:ring-offset-0 border-muted-foreground/20"
        />
      ) : (
        (() => {
          const currentValue = Array.isArray(props.filter.value)
            ? props.filter.value[0]
            : props.filter.value;
          const selectedValue = currentValue === undefined ? undefined : currentValue;

          return selectedValue !== undefined ? (
            <Select
              value={selectedValue}
              onValueChange={(value) => handleValueChange(value ?? null)}
            >
              <SelectTrigger className="w-[160px] h-8 px-2 bg-background focus:ring-0 focus:ring-offset-0 border-muted-foreground/20">
                <SelectValue placeholder="Select value" />
              </SelectTrigger>
              <SelectContent>
                {(column?.options ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.icon && <span className="mr-2">{option.icon}</span>}
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={null} onValueChange={(value) => handleValueChange(value ?? null)}>
              <SelectTrigger className="w-[160px] h-8 px-2 bg-background focus:ring-0 focus:ring-offset-0 border-muted-foreground/20">
                <SelectValue placeholder="Select value" />
              </SelectTrigger>
              <SelectContent>
                {(column?.options ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.icon && <span className="mr-2">{option.icon}</span>}
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })()
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground"
        onClick={() => ctx.removeFilter(props.filter.id)}
        aria-label="Remove filter"
      >
        <XIcon className="h-3 w-3" />
      </Button>
    </div>
  );
}
