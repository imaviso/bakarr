import { RiEditLine } from "@remixicon/react";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFieldErrors } from "@/api/effect/errors";
import { FieldError } from "@/components/shared/field-error";

const EditMappingSchema = Schema.Struct({
  episode: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  season: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
});

interface EditMappingPopoverProps {
  season?: number | null;
  episode: number;
  disabled?: boolean;
  onSave: (season: number, episode: number) => void;
}

export function EditMappingPopover(props: EditMappingPopoverProps) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: {
      episode: props.episode,
      season: props.season ?? 1,
    },
    validators: {
      onChange: Schema.standardSchemaV1(EditMappingSchema),
    },
    onSubmit: ({ value }) => {
      props.onSave(value.season, value.episode);
      setOpen(false);
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      form.setFieldValue("season", props.season ?? 1);
      form.setFieldValue("episode", props.episode);
    }
    setOpen(isOpen);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  };

  return (
    <PopoverTrigger isOpen={open} onOpenChange={handleOpenChange}>
      <Button
        variant="secondary"
        size="sm"
        className="h-6 px-2 text-xs font-mono gap-1.5 hover:bg-secondary/80"
        isDisabled={Boolean(props.disabled)}
      >
        <span>
          S{props.season ?? 1} E{props.episode}
        </span>
        <RiEditLine className="h-3 w-3 opacity-50" />
      </Button>
      <Popover className="w-64 p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Edit Mapping</h4>
            <p className="text-xs text-muted-foreground">
              Override the detected season and episode.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <form.Field name="season">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-mapping-season" className="text-xs">
                    Season
                  </Label>
                  <Input
                    id="edit-mapping-season"
                    type="number"
                    min={0}
                    className="h-8"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.valueAsNumber)}
                  />
                  <FieldError error={formatFieldErrors(field.state.meta.errors)} />
                </div>
              )}
            </form.Field>
            <form.Field name="episode">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-mapping-episode" className="text-xs">
                    MediaUnit
                  </Label>
                  <Input
                    id="edit-mapping-episode"
                    type="number"
                    min={0}
                    className="h-8"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.valueAsNumber)}
                  />
                  <FieldError error={formatFieldErrors(field.state.meta.errors)} />
                </div>
              )}
            </form.Field>
          </div>
          <div className="flex justify-end pt-2">
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-xs"
                  {...(isSubmitting ? { isDisabled: true } : { isDisabled: !canSubmit })}
                >
                  Save Changes
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </Popover>
    </PopoverTrigger>
  );
}
