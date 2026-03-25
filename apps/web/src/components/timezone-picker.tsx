import { IconCheck } from "@tabler/icons-solidjs";
import { createMemo, createSignal, For, Show } from "solid-js";
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
import { formatTimeZoneLabel, getTimeZoneOptions } from "~/lib/timezones";
import { cn } from "~/lib/utils";

interface TimezonePickerProps {
  class?: string;
  onChange: (value: string) => void;
  value?: string;
}

export function TimezonePicker(props: TimezonePickerProps) {
  const [open, setOpen] = createSignal(false);
  const options = createMemo(() => getTimeZoneOptions(props.value));
  const selectedValue = createMemo(() => props.value?.trim() || "system");

  return (
    <Popover open={open()} onOpenChange={setOpen}>
      <PopoverTrigger
        as={Button}
        variant="outline"
        class={cn("w-56 justify-between font-normal", props.class)}
      >
        <span class="truncate">{formatTimeZoneLabel(selectedValue())}</span>
      </PopoverTrigger>
      <PopoverContent class="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search timezone..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup heading="Airing timezone">
              <For each={options()}>
                {(option) => (
                  <CommandItem
                    value={`${option.value} ${option.label} ${option.note ?? ""}`}
                    onSelect={() => {
                      props.onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <IconCheck
                      class={cn(
                        "mr-2 h-4 w-4",
                        selectedValue() === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div class="min-w-0 flex-1">
                      <div class="truncate">{option.label}</div>
                      <Show when={option.note}>
                        <div class="truncate text-xs text-muted-foreground">{option.note}</div>
                      </Show>
                    </div>
                  </CommandItem>
                )}
              </For>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
