import { RiAddLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFilterContext } from "./filter-context";

export function FilterMenu() {
  const ctx = useFilterContext();

  const availableColumns = ctx.columns.filter(
    (col) => !ctx.filters.some((f) => f.columnId === col.id),
  );

  return (
    <DropdownMenuTrigger>
      <Button variant="outline" size="sm" isDisabled={availableColumns.length === 0}>
        <RiAddLine className="h-4 w-4 mr-2" />
        Add Filter
      </Button>
      <DropdownMenu>
        {availableColumns.map((column) => (
          <DropdownMenuItem key={column.id} onAction={() => ctx.addFilter(column.id)}>
            {column.icon && <span className="mr-2">{column.icon}</span>}
            {column.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}
