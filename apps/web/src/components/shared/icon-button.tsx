import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/infra/utils";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "size"> & {
  size?: "icon" | "icon-sm";
  /** Hidden until the parent `group` hovers; stays visible on focus. */
  reveal?: boolean;
};

/**
 * Icon-only button with an invisible extended hit-area (`after:-inset-2`)
 * so the touch/click target is larger than the visible glyph.
 */
export function IconButton({
  className,
  reveal,
  size = "icon",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      data-slot="icon-button"
      variant={variant}
      size={size}
      className={cn(
        "relative after:absolute after:-inset-2",
        reveal && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
        className,
      )}
      {...props}
    />
  );
}
