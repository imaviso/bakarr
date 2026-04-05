{self}: {
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.bakarr;
in {
  options.services.bakarr = {
    enable = lib.mkEnableOption "Bakarr API service";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.system}.bakarr;
      defaultText = lib.literalExpression "self.packages.${pkgs.system}.bakarr";
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
        // lib.mapAttrs (_: value: toString value) cfg.environment;

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        ExecStart = lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = 2;
      };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [cfg.port];
  };
}
