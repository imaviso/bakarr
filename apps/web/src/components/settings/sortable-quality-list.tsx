import { DotsSixVerticalIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
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
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const handleDragStart = (event: React.DragEvent<HTMLLIElement>, item: string) => {
    setDraggedItem(item);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLIElement>, targetItem: string) => {
    event.preventDefault();
    const dragged = draggedItem;
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

  const unusedQualities = props.availableQualities.filter((q) => !props.value.includes(q));

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-medium leading-none">Allowed Qualities</div>
        <p className="text-xs text-muted-foreground">Drag to reorder. Top items are preferred.</p>
      </div>

      <ul className="border rounded-md divide-y bg-card overflow-hidden">
        {props.value.map((quality) => (
          <li
            key={quality}
            draggable="true"
            onDragStart={(event) => handleDragStart(event, quality)}
            onDragOver={(event) => handleDragOver(event, quality)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 p-2.5 text-sm group bg-card hover:bg-accent/50 transition-colors cursor-default ${
              draggedItem === quality ? "opacity-50" : ""
            }`}
          >
            <DotsSixVerticalIcon className="h-4 w-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="flex-1 font-medium">{quality}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => removeQuality(quality)}
              aria-label={`Remove ${quality}`}
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
        {props.value.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground bg-muted/20">
            No qualities selected
          </li>
        )}
      </ul>

      <Select
        value={null}
        onValueChange={(value) => {
          if (value) {
            addQuality(value);
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Add Quality..." />
        </SelectTrigger>
        <SelectContent>
          {unusedQualities.map((quality) => (
            <SelectItem key={quality} value={quality}>
              {quality}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
