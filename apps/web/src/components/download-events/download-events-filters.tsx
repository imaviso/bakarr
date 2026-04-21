import { DownloadIcon, TableIcon, BracketsCurlyIcon } from "@phosphor-icons/react";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_240px_auto]">
        <div className="space-y-1">
          <Label htmlFor="download-events-anime-id">Anime ID</Label>
          <Input
            id="download-events-anime-id"
            type="number"
            value={props.value.animeId}
            onChange={(event) => props.onFieldChange("animeId", event.currentTarget.value)}
            placeholder="Any anime"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="download-events-download-id">Download ID</Label>
          <Input
            id="download-events-download-id"
            type="number"
            value={props.value.downloadId}
            onChange={(event) => props.onFieldChange("downloadId", event.currentTarget.value)}
            placeholder="Any download"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={props.eventTypeSelectId}>
            Event Type
          </label>
          <Select
            value={props.value.eventType}
            onValueChange={(value) => props.onFieldChange("eventType", value ?? "")}
          >
            <SelectTrigger id={props.eventTypeSelectId}>
              <SelectValue placeholder="all" />
            </SelectTrigger>
            <SelectContent>
              {DOWNLOAD_EVENT_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <DownloadIcon className="h-4 w-4" />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => props.onExport("json")}>
                <BracketsCurlyIcon className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onExport("csv")}>
                <TableIcon className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[220px_220px_220px_auto]">
        <div className="space-y-1">
          <Label htmlFor="download-events-status">Status</Label>
          <Input
            id="download-events-status"
            value={props.value.status}
            onChange={(event) => props.onFieldChange("status", event.currentTarget.value)}
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
        </div>
        <div className="flex items-end justify-end gap-2 flex-wrap">
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
