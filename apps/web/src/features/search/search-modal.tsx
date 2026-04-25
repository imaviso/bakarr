import { Dialog } from "~/components/ui/dialog";
import { SearchModalContent } from "~/features/search/search-modal-content";
import { useSearchModalState } from "~/features/search/search-modal-state";

interface SearchModalProps {
  animeId: number;
  episodeNumber: number;
  episodeTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchModal(props: SearchModalProps) {
  const state = useSearchModalState({
    animeId: props.animeId,
    episodeNumber: props.episodeNumber,
    open: props.open,
    onClose: () => props.onOpenChange(false),
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <SearchModalContent
        episodeNumber={props.episodeNumber}
        episodeTitle={props.episodeTitle}
        state={state}
      />
    </Dialog>
  );
}
