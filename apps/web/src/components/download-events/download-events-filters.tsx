import { IconDownload, IconFileSpreadsheet, IconJson } from "@tabler/icons-solidjs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import { DOWNLOAD_EVENT_TYPE_OPTIONS } from "~/lib/download-events-filters";

export interface DownloadEventsFilterValue {
  animeId: string;
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

interface DownloadEventsFiltersProps {
  activePreset: number | null | undefined;
  clearLabel?: string;
  eventTypeSelectId: string;
  onApplyPreset: (hours: number) => void;
  onClear: () => void;
  onExport: (format: "json" | "csv") => void;
  onFieldChange: (field: keyof DownloadEventsFilterValue, value: string) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  showPagination?: boolean;
  value: DownloadEventsFilterValue;
  nextDisabled?: boolean;
  previousDisabled?: boolean;
}

export function DownloadEventsFilters(props: DownloadEventsFiltersProps) {
  return (
    <>
      <div class="grid gap-3 md:grid-cols-[1fr_1fr_240px_auto]">
        <TextField>
          <TextFieldLabel>Anime ID</TextFieldLabel>
          <TextFieldInput
            type="number"
            value={props.value.animeId}
            onInput={(event) => props.onFieldChange("animeId", event.currentTarget.value)}
            placeholder="Any anime"
          />
        </TextField>
        <TextField>
          <TextFieldLabel>Download ID</TextFieldLabel>
          <TextFieldInput
            type="number"
            value={props.value.downloadId}
            onInput={(event) => props.onFieldChange("downloadId", event.currentTarget.value)}
            placeholder="Any download"
          />
        </TextField>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium" for={props.eventTypeSelectId}>
            Event Type
          </label>
          <Select
            name={props.eventTypeSelectId}
            value={props.value.eventType}
            onChange={(value) => value && props.onFieldChange("eventType", value)}
            options={[...DOWNLOAD_EVENT_TYPE_OPTIONS]}
            itemComponent={(itemProps) => (
              <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
            )}
          >
            <SelectTrigger id={props.eventTypeSelectId}>
              <SelectValue<string>>{(state) => state.selectedOption() ?? "all"}</SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div>
        <div class="flex items-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="outline">
              <IconDownload class="h-4 w-4" />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => props.onExport("json")}>
                <IconJson class="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onExport("csv")}>
                <IconFileSpreadsheet class="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-[220px_220px_220px_auto]">
        <TextField>
          <TextFieldLabel>Status</TextFieldLabel>
          <TextFieldInput
            value={props.value.status}
            onInput={(event) => props.onFieldChange("status", event.currentTarget.value)}
            placeholder="Any status"
          />
        </TextField>
        <TextField>
          <TextFieldLabel>Start Date</TextFieldLabel>
          <TextFieldInput
            type="datetime-local"
            value={props.value.startDate}
            onInput={(event) => props.onFieldChange("startDate", event.currentTarget.value)}
          />
        </TextField>
        <TextField>
          <TextFieldLabel>End Date</TextFieldLabel>
          <TextFieldInput
            type="datetime-local"
            value={props.value.endDate}
            onInput={(event) => props.onFieldChange("endDate", event.currentTarget.value)}
          />
        </TextField>
        <div class="flex items-end justify-end gap-2 flex-wrap">
          <Button
            variant={props.activePreset === 24 ? "default" : "outline"}
            size="sm"
            onClick={() => props.onApplyPreset(24)}
          >
            24h
          </Button>
          <Button
            variant={props.activePreset === 168 ? "default" : "outline"}
            size="sm"
            onClick={() => props.onApplyPreset(24 * 7)}
          >
            7d
          </Button>
          <Button
            variant={props.activePreset === 720 ? "default" : "outline"}
            size="sm"
            onClick={() => props.onApplyPreset(24 * 30)}
          >
            30d
          </Button>
          <Button variant="outline" onClick={props.onClear}>
            {props.clearLabel ?? "Clear Filters"}
          </Button>
          {props.showPagination && props.onPrevious && props.onNext && (
            <>
              <Button
                variant="outline"
                onClick={props.onPrevious}
                disabled={props.previousDisabled}
              >
                Previous
              </Button>
              <Button variant="outline" onClick={props.onNext} disabled={props.nextDisabled}>
                Next
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
