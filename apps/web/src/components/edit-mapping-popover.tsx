import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface EditMappingPopoverProps {
  season?: number | null;
  episode: number;
  disabled?: boolean;
  onSave: (season: number, episode: number) => void;
}

export function EditMappingPopover(props: EditMappingPopoverProps) {
  const [open, setOpen] = useState(false);
  const [localSeason, setLocalSeason] = useState(() => props.season?.toString() ?? "1");
  const [localEpisode, setLocalEpisode] = useState(() => props.episode.toString());

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setLocalSeason(props.season?.toString() ?? "1");
      setLocalEpisode(props.episode.toString());
    }
    setOpen(isOpen);
  };

  const handleSave = () => {
    const s = Number.parseInt(localSeason, 10);
    const e = Number.parseInt(localEpisode, 10);

    if (!Number.isNaN(s) && !Number.isNaN(e)) {
      props.onSave(s, e);
      setOpen(false);
    }
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
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Edit Mapping</h4>
            <p className="text-xs text-muted-foreground">
              Override the detected season and episode.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-mapping-season" className="text-xs">
                Season
              </Label>
              <Input
                id="edit-mapping-season"
                type="number"
                min={0}
                className="h-8"
                value={localSeason}
                onChange={(event) => setLocalSeason(event.currentTarget.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-mapping-episode" className="text-xs">
                Episode
              </Label>
              <Input
                id="edit-mapping-episode"
                type="number"
                min={0}
                className="h-8"
                value={localEpisode}
                onChange={(event) => setLocalEpisode(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleSave} className="h-8 text-xs">
              Save Changes
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
