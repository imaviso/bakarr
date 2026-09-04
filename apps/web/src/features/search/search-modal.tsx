import { ContentDialog } from "@/components/shared/content-dialog";
import { SearchModalContent } from "@/features/search/search-modal-content";
import { useSearchModalState } from "@/features/search/search-modal-state";
import type { MediaUnitKind } from "@/api/contracts";

interface SearchModalProps {
  mediaId: number;
  unitNumber: number;
  unitTitle?: string | null | undefined;
  unitKind?: MediaUnitKind | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchModal(props: SearchModalProps) {
  const state = useSearchModalState({
    mediaId: props.mediaId,
    unitNumber: props.unitNumber,
    open: props.open,
    onClose: () => props.onOpenChange(false),
  });

  return (
    <ContentDialog size="lg" isOpen={props.open} onOpenChange={props.onOpenChange}>
      <SearchModalContent
        unitNumber={props.unitNumber}
        unitTitle={props.unitTitle}
        unitKind={props.unitKind}
        state={state}
      />
    </ContentDialog>
  );
}
