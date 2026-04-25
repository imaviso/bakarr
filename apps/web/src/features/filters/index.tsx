import type { ReactNode } from "react";
import { FilterActions } from "./filter-actions";
import { FilterList } from "./filter-list";
import { FilterMenu } from "./filter-menu";
import { FilterProvider } from "./filter-provider";

interface FilterRootProps {
  children: ReactNode;
}

function FilterRoot(props: FilterRootProps) {
  return <div className="flex flex-col gap-3">{props.children}</div>;
}

export const Filter = {
  Provider: FilterProvider,
  Root: FilterRoot,
  Menu: FilterMenu,
  List: FilterList,
  Actions: FilterActions,
};

export * from "./types";
