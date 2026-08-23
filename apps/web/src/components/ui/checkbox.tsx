"use client";

import {
  Checkbox as CheckboxPrimitive,
  composeRenderProps,
  type CheckboxProps,
} from "react-aria-components";

import { cn } from "@/infra/utils";
import { CheckIcon } from "@phosphor-icons/react";

function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative flex cursor-pointer items-center gap-2 rounded-none outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      {composeRenderProps(children, (children, { isSelected, isIndeterminate }) => (
        <>
          <span
            data-slot="checkbox-indicator"
            className={cn(
              "relative grid size-4 shrink-0 place-content-center rounded-none border border-input bg-transparent text-current transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 dark:bg-input/30",
              "group-data-focus-visible/checkbox:border-ring group-data-focus-visible/checkbox:ring-1 group-data-focus-visible/checkbox:ring-ring/50",
              "group-data-invalid/checkbox:border-destructive group-data-invalid/checkbox:ring-1 group-data-invalid/checkbox:ring-destructive/20 dark:group-data-invalid/checkbox:border-destructive/50 dark:group-data-invalid/checkbox:ring-destructive/40",
              (isSelected || isIndeterminate) &&
                "border-primary bg-primary text-primary-foreground dark:bg-primary dark:group-data-invalid/checkbox:border-primary",
            )}
          >
            {(isSelected || isIndeterminate) && <CheckIcon className="size-3.5" />}
          </span>
          {children}
        </>
      ))}
    </CheckboxPrimitive>
  );
}

export { Checkbox };
