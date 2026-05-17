import type { ReactNode } from "react";
import type { MediaKind } from "~/api/contracts";
import { SearchDialogContent } from "~/features/search/search-dialog-content";
import { useSearchDialogState } from "~/features/search/search-dialog-state";
import { Dialog, DialogTrigger } from "~/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

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
    <Dialog open={state.open} onOpenChange={handleOpenChange}>
      {props.trigger && (
        <DialogTrigger render={<div className="contents" />}>
          {props.tooltip ? (
            <Tooltip>
              <TooltipTrigger>{props.trigger}</TooltipTrigger>
              <TooltipContent>{props.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            props.trigger
          )}
        </DialogTrigger>
      )}

      <SearchDialogContent
        mediaId={props.mediaId}
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
  );
}
