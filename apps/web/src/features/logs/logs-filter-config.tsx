import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconInfoCircle,
  IconTag,
} from "@tabler/icons-solidjs";
import type { FilterColumnConfig } from "~/components/filters";

function IconFilter() {
  return <IconTag class="h-4 w-4" />;
}

export const logsFilterColumns: FilterColumnConfig[] = [
  {
    id: "level",
    label: "Level",
    type: "select",
    icon: <IconFilter />,
    operators: ["is"],
    options: [
      {
        value: "info",
        label: "Info",
        icon: <IconInfoCircle class="h-4 w-4 text-info" />,
      },
      {
        value: "warn",
        label: "Warn",
        icon: <IconAlertTriangle class="h-4 w-4 text-warning" />,
      },
      {
        value: "error",
        label: "Error",
        icon: <IconAlertCircle class="h-4 w-4 text-error" />,
      },
      {
        value: "success",
        label: "Success",
        icon: <IconCheck class="h-4 w-4 text-success" />,
      },
    ],
  },
  {
    id: "eventType",
    label: "Event Type",
    type: "select",
    icon: <IconTag class="h-4 w-4" />,
    operators: ["is"],
    options: [
      { value: "Scan", label: "Scan" },
      { value: "Download", label: "Download" },
      { value: "Import", label: "Import" },
      { value: "Metadata", label: "Metadata" },
      { value: "RSS", label: "RSS" },
      { value: "Error", label: "Error" },
    ],
  },
  {
    id: "startDate",
    label: "Start Date",
    type: "date",
    icon: <IconCalendar class="h-4 w-4" />,
    operators: ["is_after"],
  },
  {
    id: "endDate",
    label: "End Date",
    type: "date",
    icon: <IconCalendar class="h-4 w-4" />,
    operators: ["is_before"],
  },
];
