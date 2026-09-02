import type { RemixiconComponentType } from "@remixicon/react";
import {
  RiEqualizerLine,
  RiKeyLine,
  RiLineChartLine,
  RiListCheck2,
  RiRefreshLine,
  RiSettings3Line,
} from "@remixicon/react";
import { SectionLabel } from "@/components/shared/section-label";
import { cn } from "@/infra/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NavItem {
  value: string;
  label: string;
  icon: RemixiconComponentType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const SETTINGS_GROUPS: NavGroup[] = [
  {
    label: "System",
    items: [
      { value: "general", label: "General", icon: RiSettings3Line },
      { value: "automation", label: "Automation", icon: RiRefreshLine },
      { value: "observability", label: "Observability", icon: RiLineChartLine },
    ],
  },
  {
    label: "Profiles",
    items: [
      { value: "profiles", label: "Quality Profiles", icon: RiEqualizerLine },
      { value: "release-profiles", label: "Release Profiles", icon: RiListCheck2 },
    ],
  },
  {
    label: "Account",
    items: [{ value: "account", label: "Account", icon: RiKeyLine }],
  },
];

const ALL_ITEMS = SETTINGS_GROUPS.flatMap((g) => g.items);

export function SettingsNav({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string | null) => void;
}) {
  return (
    <nav role="tablist" className="hidden md:flex flex-col gap-6 w-44 shrink-0">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <SectionLabel className="px-3">{group.label}</SectionLabel>
          {group.items.map((item) => (
            <button
              key={item.value}
              id={`tab-${item.value}`}
              role="tab"
              aria-selected={activeTab === item.value}
              aria-controls={`panel-${item.value}`}
              onClick={() => onTabChange(item.value)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const currentIndex = ALL_ITEMS.findIndex((i) => i.value === item.value);
                const nextIndex =
                  e.key === "ArrowRight"
                    ? (currentIndex + 1) % ALL_ITEMS.length
                    : (currentIndex - 1 + ALL_ITEMS.length) % ALL_ITEMS.length;
                const nextItem = ALL_ITEMS[nextIndex];
                if (nextItem) {
                  onTabChange(nextItem.value);
                  document.getElementById(`tab-${nextItem.value}`)?.focus();
                }
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors text-left",
                activeTab === item.value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function SettingsMobileSelect({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string | null) => void;
}) {
  const activeItem = ALL_ITEMS.find((t) => t.value === activeTab);

  return (
    <div className="md:hidden">
      <Select
        selectedKey={activeTab}
        onSelectionChange={(key) => onTabChange(key === null ? null : String(key))}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {activeItem && (
              <span className="flex items-center gap-2">
                <activeItem.icon className="h-4 w-4 shrink-0" />
                {activeItem.label}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SETTINGS_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.value} id={item.value} textValue={item.label}>
                  <span className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
