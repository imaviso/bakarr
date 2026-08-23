import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly isPending?: boolean;
  readonly onConfirm: () => void;
  /** When given, the dialog renders uncontrolled behind this trigger. */
  readonly trigger?: ReactNode;
  /** Controlled mode when no trigger is given. */
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

const destructiveClasses = "bg-destructive text-destructive-foreground hover:bg-destructive/90";

export function ConfirmDialog(props: ConfirmDialogProps) {
  // AlertDialog is react-aria ModalOverlay; controlled via isOpen/onOpenChange.
  // When trigger is provided, AlertDialogTrigger manages open state uncontrolled.
  const dialog = (
    <AlertDialog
      {...(props.isOpen === undefined ? {} : { isOpen: props.isOpen })}
      {...(props.onOpenChange === undefined ? {} : { onOpenChange: props.onOpenChange })}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{props.title}</AlertDialogTitle>
        {props.description !== undefined && (
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        )}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{props.cancelLabel ?? "Cancel"}</AlertDialogCancel>
        <AlertDialogAction
          {...(props.destructive ? { className: destructiveClasses } : {})}
          {...(props.isPending === undefined ? {} : { isDisabled: props.isPending })}
          onPress={props.onConfirm}
        >
          {props.isPending ? "Working..." : (props.confirmLabel ?? "Confirm")}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialog>
  );

  if (props.trigger === undefined) {
    return dialog;
  }

  return (
    <AlertDialogTrigger>
      {props.trigger}
      {dialog}
    </AlertDialogTrigger>
  );
}
