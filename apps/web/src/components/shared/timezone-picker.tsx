import { CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { formatTimeZoneLabel, getTimeZoneOptions } from "~/domain/timezones";
import { cn } from "~/infra/utils";

interface TimezonePickerProps {
  className?: string;
  onChange: (value: string) => void;
  value?: string;
}

export function TimezonePicker(props: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const options = getTimeZoneOptions(props.value);
  const selectedValue = props.value?.trim() || "system";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" />}
        className={cn("w-56 justify-between font-normal", props.className)}
      >
        <span className="truncate">{formatTimeZoneLabel(selectedValue)}</span>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search timezone..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup heading="Airing timezone">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.value} ${option.label} ${option.note ?? ""}`}
                  onSelect={() => {
                    props.onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedValue === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{option.label}</div>
                    {option.note && (
                      <div className="truncate text-xs text-muted-foreground">{option.note}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
