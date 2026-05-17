import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";

interface DeleteAnimeDialogProps {
  mediaLabel?: string;
  title: string;
  onConfirm: () => void;
  trigger: ReactNode;
}

export function DeleteAnimeDialog(props: DeleteAnimeDialogProps) {
  const mediaLabel = props.mediaLabel ?? "media";

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<div />}>{props.trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {mediaLabel}</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{props.title}&quot;? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
