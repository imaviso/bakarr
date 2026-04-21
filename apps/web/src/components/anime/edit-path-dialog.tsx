import { useEffect, useState } from "react";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface EditPathDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  animeId: number;
  updatePath: (input: { id: number; path: string; rescan?: boolean }) => Promise<unknown>;
  isPending: boolean;
}

export function EditPathDialog(props: EditPathDialogProps) {
  const [path, setPath] = useState(props.currentPath);
  const [rescan, setRescan] = useState(true);

  useEffect(() => {
    if (props.open) {
      setPath(props.currentPath);
      setRescan(true);
    }
  }, [props.open, props.currentPath]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    void props.updatePath({ id: props.animeId, path, rescan });
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Root Path</DialogTitle>
          <DialogDescription>Change the folder path for this anime.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-path-input">Path</Label>
            <Input
              id="edit-path-input"
              value={path}
              onChange={(event) => setPath(event.currentTarget.value)}
              placeholder="/path/to/anime"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="rescan" checked={rescan} onCheckedChange={setRescan} />
            <label
              htmlFor="rescan"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
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
