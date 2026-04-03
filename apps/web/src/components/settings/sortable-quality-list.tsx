import { IconGripVertical, IconPlus, IconX } from "@tabler/icons-solidjs";
import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface SortableQualityListProps {
  value: string[];
  onChange: (value: string[]) => void;
  availableQualities: string[];
}

export function SortableQualityList(props: SortableQualityListProps) {
  const [draggedItem, setDraggedItem] = createSignal<string | null>(null);

  const handleDragStart = (event: DragEvent, item: string) => {
    setDraggedItem(item);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (event: DragEvent, targetItem: string) => {
    event.preventDefault();
    const dragged = draggedItem();
    if (!dragged || dragged === targetItem) return;

    const currentList = [...props.value];
    const fromIndex = currentList.indexOf(dragged);
    const toIndex = currentList.indexOf(targetItem);
    if (fromIndex === -1 || toIndex === -1) return;

    currentList.splice(fromIndex, 1);
    currentList.splice(toIndex, 0, dragged);
    props.onChange(currentList);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const removeQuality = (quality: string) => {
    props.onChange(props.value.filter((q) => q !== quality));
  };

  const addQuality = (quality: string) => {
    if (!props.value.includes(quality)) {
      props.onChange([...props.value, quality]);
    }
  };

  const unusedQualities = () => props.availableQualities.filter((q) => !props.value.includes(q));

  return (
    <div class="space-y-3">
      <div class="space-y-1">
        <div class="text-sm font-medium leading-none">Allowed Qualities</div>
        <p class="text-xs text-muted-foreground">Drag to reorder. Top items are preferred.</p>
      </div>

      <ul class="border rounded-md divide-y bg-card overflow-hidden">
        <For each={props.value}>
          {(quality) => (
            <li
              draggable="true"
              onDragStart={(event) => handleDragStart(event, quality)}
              onDragOver={(event) => handleDragOver(event, quality)}
              onDragEnd={handleDragEnd}
              class={`flex items-center gap-3 p-2.5 text-sm group bg-card hover:bg-accent/50 transition-colors cursor-default ${
                draggedItem() === quality ? "opacity-50" : ""
              }`}
            >
              <IconGripVertical class="h-4 w-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
              <span class="flex-1 font-medium">{quality}</span>
              <Button
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeQuality(quality)}
                aria-label={`Remove ${quality}`}
              >
                <IconX class="h-3.5 w-3.5" />
              </Button>
            </li>
          )}
        </For>
        <Show when={props.value.length === 0}>
          <li class="p-4 text-center text-sm text-muted-foreground bg-muted/20">
            No qualities selected
          </li>
        </Show>
      </ul>

      <Select
        value={null}
        onChange={(value) => value && addQuality(value)}
        options={unusedQualities()}
        placeholder="Add quality..."
        itemComponent={(itemProps) => (
          <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
        )}
      >
        <SelectTrigger class="w-full">
          <SelectValue<string>>
            {() => (
              <div class="flex items-center gap-2 text-muted-foreground">
                <IconPlus class="h-4 w-4" />
                Add Quality...
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent />
      </Select>
    </div>
  );
}
