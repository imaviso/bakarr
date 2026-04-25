import { useFilterContext } from "./filter-context";
import { Button } from "~/components/ui/button";

export function FilterActions() {
  const ctx = useFilterContext();

  return (
    <>
      {ctx.filters.length > 0 && (
        <Button variant="ghost" size="sm" onClick={ctx.clearAllFilters}>
          Clear all
        </Button>
      )}
    </>
  );
}
