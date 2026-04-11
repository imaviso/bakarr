import { type JSX, Show } from "solid-js";
import { SearchDialogContent } from "~/components/search-dialog-content";
import { useSearchDialogState } from "~/components/search-dialog-state";
import { Dialog, DialogTrigger } from "~/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

interface SearchDialogProps {
  trigger?: JSX.Element;
  animeId: number;
  defaultQuery: string;
  tooltip?: string;
}

export function SearchDialog(props: SearchDialogProps) {
  const state = useSearchDialogState(() => props.defaultQuery);

  return (
    <Dialog open={state.open()} onOpenChange={state.setOpen}>
      <Show when={props.trigger}>
        <DialogTrigger as="div" class="contents">
          <Show when={props.tooltip} fallback={props.trigger}>
            <Tooltip>
              <TooltipTrigger>{props.trigger}</TooltipTrigger>
              <TooltipContent>{props.tooltip}</TooltipContent>
            </Tooltip>
          </Show>
        </DialogTrigger>
      </Show>

      <SearchDialogContent
        animeId={props.animeId}
        open={state.open()}
        setOpen={state.setOpen}
        query={state.query()}
        setQuery={state.setQuery}
        debouncedQuery={state.debouncedQuery()}
        category={state.category()}
        setCategory={(value) => {
          if (value) {
            state.setCategory(value);
          }
        }}
        filter={state.filter()}
        setFilter={(value) => {
          if (value) {
            state.setFilter(value);
          }
        }}
      />
    </Dialog>
  );
}
