import type { ReactNode } from "react";
import type { MediaKind } from "~/api/contracts";
import { SearchDialogContent } from "~/features/search/search-dialog-content";
import { useSearchDialogState } from "~/features/search/search-dialog-state";
import { Dialog } from "~/components/ui/dialog";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { DialogTrigger } from "react-aria-components";

interface SearchDialogProps {
  trigger?: ReactNode;
  mediaId: number;
  mediaKind: MediaKind;
  defaultQuery: string;
  tooltip?: string;
}

export function SearchDialog(props: SearchDialogProps) {
  const state = useSearchDialogState(props.defaultQuery, props.mediaKind);

  const handleOpenChange = (open: boolean) => {
    state.setOpen(open);
    if (open) {
      state.setQuery(props.defaultQuery);
    }
  };

  return (
    <DialogTrigger isOpen={state.open} onOpenChange={handleOpenChange}>
      {props.trigger &&
        (props.tooltip ? (
          <TooltipTrigger>
            {props.trigger}
            <Tooltip>{props.tooltip}</Tooltip>
          </TooltipTrigger>
        ) : (
          props.trigger
        ))}

      <Dialog>
        <SearchDialogContent
          mediaId={props.mediaId}
          mediaKind={props.mediaKind}
          open={state.open}
          setOpen={state.setOpen}
          query={state.query}
          setQuery={state.setQuery}
          debouncedQuery={state.debouncedQuery}
          category={state.category}
          setCategory={(value) => {
            if (value) {
              state.setCategory(value);
            }
          }}
          filter={state.filter}
          setFilter={(value) => {
            if (value) {
              state.setFilter(value);
            }
          }}
        />
      </Dialog>
    </DialogTrigger>
  );
}
