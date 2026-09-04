import type { FormEvent } from "react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFieldErrors } from "@/api/effect/errors";
import { FieldError } from "@/components/shared/field-error";

const EditPathSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
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
      onChange: Schema.toStandardSchemaV1(EditPathSchema),
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
    <Dialog isOpen={props.open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit Root Path</DialogTitle>
        <DialogDescription>Change the folder path for this media.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-path-input">Path</Label>
          <form.Field name="path">
            {(field) => (
              <>
                <Input
                  id="edit-path-input"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  placeholder="/path/to/media"
                />
                <FieldError error={formatFieldErrors(field.state.meta.errors)} />
              </>
            )}
          </form.Field>
        </div>
        <form.Field name="rescan">
          {(field) => (
            <Checkbox
              isSelected={field.state.value}
              onChange={field.handleChange}
              className="text-sm font-medium leading-none"
            >
              Rescan folder after update
            </Checkbox>
          )}
        </form.Field>
        <DialogFooter>
          <Button type="button" variant="outline" onPress={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <form.Subscribe selector={(state) => [state.canSubmit]}>
            {([canSubmit]) => (
              <Button type="submit" isDisabled={!canSubmit || props.isPending}>
                {props.isPending ? "Updating..." : "Save"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
