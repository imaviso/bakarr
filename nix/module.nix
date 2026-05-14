{self}: {
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.bakarr;
  optionalEnv = name: value: lib.optionalAttrs (value != null) {${name} = toString value;};
  observabilityEnv =
    optionalEnv "OTEL_EXPORTER_OTLP_ENDPOINT" cfg.observability.otlpEndpoint
    // optionalEnv "OTEL_SERVICE_NAME" cfg.observability.serviceName
    // optionalEnv "OTEL_SERVICE_VERSION" cfg.observability.serviceVersion
    // optionalEnv "OTEL_DEPLOYMENT_ENVIRONMENT" cfg.observability.deploymentEnvironment
    // optionalEnv "OTEL_RESOURCE_ATTRIBUTES" cfg.observability.resourceAttributes
    // optionalEnv "OTEL_METRICS_EXPORT_INTERVAL_MS" cfg.observability.metricsExportIntervalMs
    // optionalEnv "OTEL_TRACES_EXPORT_INTERVAL_MS" cfg.observability.tracesExportIntervalMs
    // optionalEnv "OTEL_SHUTDOWN_TIMEOUT_MS" cfg.observability.shutdownTimeoutMs
    // optionalEnv "BAKARR_METRICS_REQUIRE_AUTH" cfg.observability.metricsRequireAuth
    // optionalEnv "BAKARR_GRAFANA_URL" cfg.observability.grafanaUrl
    // optionalEnv "BAKARR_VICTORIAMETRICS_URL" cfg.observability.victoriaMetricsUrl
    // optionalEnv "BAKARR_TEMPO_URL" cfg.observability.tempoUrl
    // optionalEnv "BAKARR_LOKI_URL" cfg.observability.lokiUrl;
in {
  options.services.bakarr = {
    enable = lib.mkEnableOption "Bakarr API service";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.bakarr;
      defaultText = lib.literalExpression "self.packages.${pkgs.stdenv.hostPlatform.system}.bakarr";
      description = "Bakarr package to run.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "bakarr";
      description = "User account under which Bakarr runs.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "bakarr";
      description = "Group under which Bakarr runs.";
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/bakarr";
      description = "Directory for Bakarr state, including SQLite database.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8000;
      description = "HTTP port for the Bakarr API.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Open the configured API port in the firewall.";
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf (lib.types.oneOf [
        lib.types.str
        lib.types.int
        lib.types.bool
      ]);
      default = {};
      description = "Additional environment variables for the Bakarr service.";
      example = {
        BAKARR_BOOTSTRAP_USERNAME = "admin";
        SESSION_COOKIE_SECURE = true;
      };
    };

    observability = {
      otlpEndpoint = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "http://otel-collector:4318";
        description = "OTLP HTTP endpoint. When unset, Bakarr does not push OTLP telemetry.";
      };

      otlpHeadersFile = lib.mkOption {
        type = lib.types.nullOr lib.types.path;
        default = null;
        example = "/run/secrets/bakarr-otel.env";
        description = ''
          Environment file containing OTEL_EXPORTER_OTLP_HEADERS for OTLP auth.
          Use this for API keys so secrets do not enter the Nix store.
        '';
      };

      serviceName = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = "bakarr-api";
        description = "OpenTelemetry service.name resource attribute.";
      };

      serviceVersion = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "OpenTelemetry service.version resource attribute. Defaults to Bakarr app config when unset.";
      };

      deploymentEnvironment = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "home";
        description = "OpenTelemetry deployment.environment.name resource attribute.";
      };

      resourceAttributes = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "host.name=media-server,service.namespace=home";
        description = "Comma-separated OTEL_RESOURCE_ATTRIBUTES value.";
      };

      metricsExportIntervalMs = lib.mkOption {
        type = lib.types.nullOr lib.types.positiveInt;
        default = null;
        example = 60000;
        description = "OTLP metrics export interval in milliseconds.";
      };

      tracesExportIntervalMs = lib.mkOption {
        type = lib.types.nullOr lib.types.positiveInt;
        default = null;
        example = 1000;
        description = "OTLP traces export interval in milliseconds.";
      };

      shutdownTimeoutMs = lib.mkOption {
        type = lib.types.nullOr lib.types.positiveInt;
        default = null;
        example = 3000;
        description = "OTLP exporter shutdown timeout in milliseconds.";
      };

      metricsRequireAuth = lib.mkOption {
        type = lib.types.nullOr lib.types.bool;
        default = null;
        description = "Whether /api/metrics requires Bakarr auth. Leave false/null for unauthenticated scrapers.";
      };

      grafanaUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "http://grafana.lan:3000";
        description = "Public Grafana URL shown in the Bakarr UI.";
      };

      victoriaMetricsUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "http://victoriametrics.lan:8428";
        description = "Public VictoriaMetrics URL shown in the Bakarr UI.";
      };

      tempoUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "http://tempo.lan:3200";
        description = "Public Tempo URL shown in the Bakarr UI.";
      };

      lokiUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        example = "http://loki.lan:3100";
        description = "Public Loki URL shown in the Bakarr UI.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    users.groups = lib.mkIf (cfg.group == "bakarr") {
      bakarr = {};
    };

    users.users = lib.mkIf (cfg.user == "bakarr") {
      bakarr = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.dataDir;
        createHome = true;
      };
    };

    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} -"
    ];

    systemd.services.bakarr = {
      description = "Bakarr API";
      wantedBy = ["multi-user.target"];
      after = ["network.target"];

      environment =
        {
          DATABASE_FILE = "${cfg.dataDir}/bakarr.sqlite";
          PORT = toString cfg.port;
        }
        // observabilityEnv
        // lib.mapAttrs (_: value: toString value) cfg.environment;

      serviceConfig =
        {
          Type = "simple";
          User = cfg.user;
          Group = cfg.group;
          WorkingDirectory = cfg.dataDir;
          ExecStart = lib.getExe cfg.package;
          Restart = "on-failure";
          RestartSec = 2;
        }
        // lib.optionalAttrs (cfg.observability.otlpHeadersFile != null) {
          EnvironmentFile = cfg.observability.otlpHeadersFile;
        };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [cfg.port];
  };
}
