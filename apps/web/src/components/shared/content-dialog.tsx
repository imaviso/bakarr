import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/infra/utils";

/**
 * Owns the sizing recipes for scrollable content dialogs. These viewport
 * calculations have no Tailwind scale equivalent; they are allowlisted here
 * so no other file needs arbitrary width/height classes.
 */
const contentDialogVariants = cva(
  "flex flex-col w-[calc(100vw-2rem)] sm:w-full max-h-[85vh] p-0 gap-0 overflow-hidden",
  {
    variants: {
      size: {
        sm: "sm:max-w-[37.5rem]",
        md: "sm:max-w-[50rem]",
        lg: "sm:max-w-7xl",
        xl: "max-w-none sm:max-w-none w-[min(calc(100vw-2rem),72rem)]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface ContentDialogProps {
  readonly size?: VariantProps<typeof contentDialogVariants>["size"];
  /** Escape hatch for one-off shells (e.g. fixed-height search palette). */
  readonly className?: string;
  readonly children: ReactNode;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly isDismissable?: boolean;
  readonly showCloseButton?: boolean;
}

export function ContentDialog(props: ContentDialogProps) {
  return (
    <Dialog
      {...(props.isOpen === undefined ? {} : { isOpen: props.isOpen })}
      {...(props.onOpenChange === undefined ? {} : { onOpenChange: props.onOpenChange })}
      {...(props.isDismissable === undefined ? {} : { isDismissable: props.isDismissable })}
      {...(props.showCloseButton === undefined ? {} : { showCloseButton: props.showCloseButton })}
      className={cn(contentDialogVariants({ size: props.size }), props.className)}
    >
      {props.children}
    </Dialog>
  );
}

export function ContentDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <DialogHeader
      className={cn("p-4 pb-3 shrink-0 border-b border-border", className)}
      {...props}
    />
  );
}

export function ContentDialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex-1 min-h-0 overflow-auto", className)} {...props} />;
}

export function ContentDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <DialogFooter
      className={cn("p-4 pt-3 shrink-0 border-t border-border", className)}
      {...props}
    />
  );
}
