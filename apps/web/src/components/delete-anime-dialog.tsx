import type { JSX } from "solid-js";
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
  title: string;
  onConfirm: () => void;
  trigger: JSX.Element;
}

export function DeleteAnimeDialog(props: DeleteAnimeDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger as="div">{props.trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Anime</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{props.title}"? This action cannot be undone.
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
