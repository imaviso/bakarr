import { createEffect, createSignal } from "solid-js";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

interface EditPathDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  animeId: number;
  updatePath: (input: { id: number; path: string; rescan?: boolean }) => Promise<unknown>;
  isPending: boolean;
}

export function EditPathDialog(props: EditPathDialogProps) {
  const [path, setPath] = createSignal(props.currentPath);
  const [rescan, setRescan] = createSignal(true);

  createEffect(() => {
    if (props.open) {
      setPath(props.currentPath);
      setRescan(true);
    }
  });

  const handleSubmit = (event: Event) => {
    event.preventDefault();

    void props.updatePath({ id: props.animeId, path: path(), rescan: rescan() });
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Root Path</DialogTitle>
          <DialogDescription>Change the folder path for this anime.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} class="space-y-4">
          <div class="space-y-2">
            <TextField value={path()} onChange={setPath}>
              <TextFieldLabel>Path</TextFieldLabel>
              <TextFieldInput placeholder="/path/to/anime" />
            </TextField>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="rescan" checked={rescan()} onChange={setRescan} />
            <label
              for="rescan"
              class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Rescan folder after update
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={props.isPending}>
              {props.isPending ? "Updating..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
