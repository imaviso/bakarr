import type { FormEvent } from "react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
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

const EditPathSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1)),
  rescan: Schema.Boolean,
});

interface EditPathDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  mediaId: number;
  updatePath: (input: { id: number; path: string; rescan?: boolean }) => Promise<unknown>;
  isPending: boolean;
}

export function EditPathDialog(props: EditPathDialogProps) {
  const form = useForm({
    defaultValues: {
      path: props.currentPath,
      rescan: true,
    },
    validators: {
      onChange: Schema.standardSchemaV1(EditPathSchema),
    },
    onSubmit: async ({ value }) => {
      await props.updatePath({ id: props.mediaId, path: value.path, rescan: value.rescan });
      props.onOpenChange(false);
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (open) {
      form.setFieldValue("path", props.currentPath);
      form.setFieldValue("rescan", true);
    }
    props.onOpenChange(open);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    void form.handleSubmit();
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Root Path</DialogTitle>
          <DialogDescription>Change the folder path for this media.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-path-input">Path</Label>
            <form.Field name="path">
              {(field) => (
                <Input
                  id="edit-path-input"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  placeholder="/path/to/anime"
                />
              )}
            </form.Field>
          </div>
          <form.Field name="rescan">
            {(field) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rescan"
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
                <label
                  htmlFor="rescan"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Rescan folder after update
                </label>
              </div>
            )}
          </form.Field>
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
