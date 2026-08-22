import { DownloadIcon, TableIcon, BracketsCurlyIcon } from "@phosphor-icons/react";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { DebouncedInput } from "~/components/shared/debounced-input";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS } from "~/api/contracts";

export interface DownloadEventsFilterValue {
  mediaId: string;
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
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_240px_auto]">
        <div className="space-y-1">
          <Label htmlFor="download-events-anime-id">Media ID</Label>
          <DebouncedInput
            id="download-events-anime-id"
            type="number"
            value={props.value.mediaId}
            onCommit={(value) => props.onFieldChange("mediaId", value)}
            placeholder="Any anime"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="download-events-download-id">Download ID</Label>
          <DebouncedInput
            id="download-events-download-id"
            type="number"
            value={props.value.downloadId}
            onCommit={(value) => props.onFieldChange("downloadId", value)}
            placeholder="Any download"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-medium" htmlFor={props.eventTypeSelectId}>
            Event Type
          </Label>
          <Select
            selectedKey={props.value.eventType}
            onSelectionChange={(value) =>
              props.onFieldChange("eventType", value === null ? "" : String(value))
            }
          >
            <SelectTrigger id={props.eventTypeSelectId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option} id={option} textValue={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <DropdownMenuTrigger>
            <Button variant="outline">
              <DownloadIcon className="h-4 w-4" />
              Export
            </Button>
            <DropdownMenu>
              <DropdownMenuItem onAction={() => props.onExport("json")}>
                <BracketsCurlyIcon className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onAction={() => props.onExport("csv")}>
                <TableIcon className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenu>
          </DropdownMenuTrigger>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[220px_220px_220px_auto]">
        <div className="space-y-1">
          <Label htmlFor="download-events-status">Status</Label>
          <DebouncedInput
            id="download-events-status"
            value={props.value.status}
            onCommit={(value) => props.onFieldChange("status", value)}
            placeholder="Any status"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="download-events-start">Start Date</Label>
          <Input
            id="download-events-start"
            type="datetime-local"
            value={props.value.startDate}
            onChange={(event) => props.onFieldChange("startDate", event.currentTarget.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="download-events-end">End Date</Label>
          <Input
            id="download-events-end"
            type="datetime-local"
            value={props.value.endDate}
            onChange={(event) => props.onFieldChange("endDate", event.currentTarget.value)}
          />
        </div>{" "}
        <div className="flex items-end justify-end gap-2 flex-wrap">
          <Button
            variant={props.activePreset === 24 ? "default" : "outline"}
            size="sm"
            onPress={() => props.onApplyPreset(24)}
          >
            24h
          </Button>
          <Button
            variant={props.activePreset === 168 ? "default" : "outline"}
            size="sm"
            onPress={() => props.onApplyPreset(24 * 7)}
          >
            7d
          </Button>
          <Button
            variant={props.activePreset === 720 ? "default" : "outline"}
            size="sm"
            onPress={() => props.onApplyPreset(24 * 30)}
          >
            30d
          </Button>
          <Button variant="outline" onPress={props.onClear}>
            {props.clearLabel ?? "Clear Filters"}
          </Button>
          {props.showPagination && props.onPrevious && props.onNext && (
            <>
              <Button
                variant="outline"
                onPress={props.onPrevious}
                isDisabled={Boolean(props.previousDisabled)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onPress={props.onNext}
                isDisabled={Boolean(props.nextDisabled)}
              >
                Next
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
