import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

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
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={<Button variant="secondary" size="sm" />}
        className="h-6 px-2 text-xs font-mono gap-1.5 hover:bg-secondary/80"
        disabled={props.disabled}
      >
        <span>
          S{props.season ?? 1} E{props.episode}
        </span>
        <PencilSimpleIcon className="h-3 w-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4">
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
                </div>
              )}
            </form.Field>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" size="sm" className="h-8 text-xs">
              Save Changes
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
