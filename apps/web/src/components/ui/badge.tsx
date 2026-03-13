import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-none border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        success: "border-success-foreground bg-success text-success-foreground",
        warning: "border-warning-foreground bg-warning text-warning-foreground",
        error: "border-error-foreground bg-error text-error-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps =
  & ComponentProps<"div">
  & VariantProps<typeof badgeVariants>
  & {
    round?: boolean;
  };

const Badge: Component<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant", "round"]);
  return (
    <div
      class={cn(
        badgeVariants({ variant: local.variant }),
        local.round && "rounded-none",
        local.class,
      )}
      {...others}
    />
  );
};

export type { BadgeProps };
export { Badge, badgeVariants };
