// Shared system status and observability wire contracts.
import { Schema } from "effect";

export interface SystemStatus {
  version: string;
  uptime: number;
  active_torrents: number;
  pending_downloads: number;
  metadata_providers: {
    anidb: {
      enabled: boolean;
      configured: boolean;
    };
    jikan: {
      enabled: boolean;
      configured: boolean;
    };
    manami: {
      enabled: boolean;
      configured: boolean;
    };
  };
  disk_space: {
    free: number;
    total: number;
  };
  last_scan?: string | null | undefined;
  last_rss?: string | null | undefined;
  last_metadata_refresh?: string | null | undefined;
}

export const DiskSpaceSchema = Schema.Struct({
  free: Schema.Number,
  total: Schema.Number,
});

export const SystemStatusMetadataProvidersSchema = Schema.Struct({
  anidb: Schema.Struct({
    enabled: Schema.Boolean,
    configured: Schema.Boolean,
  }),
  jikan: Schema.Struct({
    enabled: Schema.Boolean,
    configured: Schema.Boolean,
  }),
  manami: Schema.Struct({
    enabled: Schema.Boolean,
    configured: Schema.Boolean,
  }),
});

export const SystemStatusSchema = Schema.Struct({
  version: Schema.String,
  uptime: Schema.Number,
  active_torrents: Schema.Number,
  pending_downloads: Schema.Number,
  metadata_providers: SystemStatusMetadataProvidersSchema,
  disk_space: DiskSpaceSchema,
  last_scan: Schema.optional(Schema.NullOr(Schema.String)),
  last_rss: Schema.optional(Schema.NullOr(Schema.String)),
  last_metadata_refresh: Schema.optional(Schema.NullOr(Schema.String)),
});

export interface ObservabilityStatus {
  environment?: string | null | undefined;
  links: {
    grafana?: string | null | undefined;
    loki?: string | null | undefined;
    tempo?: string | null | undefined;
    victoriametrics?: string | null | undefined;
  };
  metrics_endpoint: string;
  metrics_require_auth: boolean;
  otlp_endpoint?: string | null | undefined;
  otlp_enabled: boolean;
  service_name: string;
  service_version: string;
}

export const ObservabilityLinksSchema = Schema.Struct({
  grafana: Schema.optional(Schema.NullOr(Schema.String)),
  loki: Schema.optional(Schema.NullOr(Schema.String)),
  tempo: Schema.optional(Schema.NullOr(Schema.String)),
  victoriametrics: Schema.optional(Schema.NullOr(Schema.String)),
});

export const ObservabilityStatusSchema = Schema.Struct({
  environment: Schema.optional(Schema.NullOr(Schema.String)),
  links: ObservabilityLinksSchema,
  metrics_endpoint: Schema.String,
  metrics_require_auth: Schema.Boolean,
  otlp_endpoint: Schema.optional(Schema.NullOr(Schema.String)),
  otlp_enabled: Schema.Boolean,
  service_name: Schema.String,
  service_version: Schema.String,
});
