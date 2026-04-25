import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useFilterContext } from "./filter-context";

export function FilterMenu() {
  const ctx = useFilterContext();

  const availableColumns = ctx.columns.filter(
    (col) => !ctx.filters.some((f) => f.columnId === col.id),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" />}
        disabled={availableColumns.length === 0}
      >
        <PlusIcon className="h-4 w-4 mr-2" />
        Add Filter
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {availableColumns.map((column) => (
          <DropdownMenuItem key={column.id} onClick={() => ctx.addFilter(column.id)}>
            {column.icon && <span className="mr-2">{column.icon}</span>}
            {column.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
