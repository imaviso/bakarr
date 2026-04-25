import { useFilterContext } from "./filter-context";
import { FilterItem } from "./filter-item";

export function FilterList() {
  const ctx = useFilterContext();

  return (
    <>
      {ctx.filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ctx.filters.map((filter) => (
            <FilterItem key={filter.id} filter={filter} />
          ))}
        </div>
      )}
    </>
  );
}
