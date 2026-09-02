import type { ReactNode } from "react";

export function FilterRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}
