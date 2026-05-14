import { ArrowSquareOutIcon, ChartLineUpIcon, LockIcon, PulseIcon } from "@phosphor-icons/react";
import type { ObservabilityStatus } from "@bakarr/shared";

import { useObservabilityStatusQuery } from "~/api/system-config";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { SettingRow, SettingSection } from "~/features/settings/form-controls";

const LINK_LABELS: Record<keyof ObservabilityStatus["links"], string> = {
  grafana: "Grafana",
  loki: "Loki",
  tempo: "Tempo",
  victoriametrics: "VictoriaMetrics",
};

const LINK_KEYS: ReadonlyArray<keyof ObservabilityStatus["links"]> = [
  "grafana",
  "victoriametrics",
  "tempo",
  "loki",
];

export function ObservabilitySettingsPanel() {
  const observability = useObservabilityStatusQuery();

  if (observability.isLoading) {
    return <ObservabilitySkeleton />;
  }

  if (observability.isError || observability.data === undefined) {
    return (
      <div className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        Observability status unavailable.
      </div>
    );
  }

  const data = observability.data;
  const links = LINK_KEYS.flatMap((key) => {
    const value = data.links[key];
    return typeof value === "string" && value.length > 0 ? [{ key, value }] : [];
  });

  return (
    <div className="space-y-6">
      <div className="border border-border bg-muted/20 px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <PulseIcon className="size-4 text-muted-foreground" />
              <h3 className="font-mono text-sm font-medium tracking-tight">Telemetry Export</h3>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Bakarr emits runtime metrics, traces, and logs for external observability tools.
              Dashboards and long-term analysis stay in Grafana.
            </p>
          </div>
          <Badge variant={data.otlp_enabled ? "success" : "secondary"}>
            {data.otlp_enabled ? "OTLP enabled" : "OTLP disabled"}
          </Badge>
        </div>
      </div>

      <SettingSection title="Runtime identity">
        <SettingRow label="Service" description="Resource identity attached to telemetry export">
          <ReadOnlyValue value={`${data.service_name} ${data.service_version}`} />
        </SettingRow>
        <SettingRow label="Environment" description="Deployment environment resource attribute">
          <ReadOnlyValue value={data.environment ?? "Not set"} muted={data.environment == null} />
        </SettingRow>
        <SettingRow
          label="OTLP endpoint"
          description="Safe endpoint origin, exporter headers hidden"
        >
          <ReadOnlyValue
            value={data.otlp_endpoint ?? "Not configured"}
            muted={!data.otlp_enabled}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Metrics scrape">
        <SettingRow
          label="Prometheus endpoint"
          description="Scraped by VictoriaMetrics or an OTel Collector"
        >
          <ReadOnlyValue value={data.metrics_endpoint} />
        </SettingRow>
        <SettingRow label="Scraper auth" description="Whether /api/metrics requires Bakarr auth">
          <Badge variant={data.metrics_require_auth ? "warning" : "success"}>
            <LockIcon className="size-3" />
            {data.metrics_require_auth ? "Required" : "Open"}
          </Badge>
        </SettingRow>
      </SettingSection>

      <SettingSection title="External tools">
        {links.length === 0 ? (
          <div className="py-3 text-sm text-muted-foreground">
            No observability links configured. Set Grafana, VictoriaMetrics, Tempo, or Loki URLs in
            the API environment.
          </div>
        ) : (
          links.map(({ key, value }) => (
            <SettingRow key={key} label={LINK_LABELS[key]}>
              <Button
                variant="outline"
                size="sm"
                render={<a href={value} target="_blank" rel="noreferrer" />}
              >
                Open
                <ArrowSquareOutIcon className="size-3.5" />
              </Button>
            </SettingRow>
          ))
        )}
      </SettingSection>

      <div className="flex items-start gap-2 border border-border/70 px-3 py-2 text-xs text-muted-foreground">
        <ChartLineUpIcon className="mt-0.5 size-3.5 shrink-0" />
        Configure exporter endpoints through environment variables. The UI is read-only to avoid
        exposing OTLP headers and runtime exporter state.
      </div>
    </div>
  );
}

function ReadOnlyValue(props: { value: string; muted?: boolean }) {
  return (
    <span className={props.muted ? "text-sm text-muted-foreground" : "font-mono text-xs"}>
      {props.value}
    </span>
  );
}

function ObservabilitySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
