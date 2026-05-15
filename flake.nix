{
  description = "Bakarr development environment, package, and NixOS module";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = {self, ...} @ inputs: let
    supportedSystems = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];

    forEachSupportedSystem = f:
      inputs.nixpkgs.lib.genAttrs supportedSystems (
        system:
          f {
            pkgs = import inputs.nixpkgs {inherit system;};
          }
      );
  in {
    packages = forEachSupportedSystem ({pkgs}: let
      bakarr = pkgs.callPackage ./nix/package.nix {src = self;};
    in {
      inherit bakarr;
      default = bakarr;
    });

    apps = forEachSupportedSystem ({pkgs}: {
      default = {
        type = "app";
        program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.bakarr}/bin/bakarr-api";
      };

      bakarr-api = {
        type = "app";
        program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.bakarr}/bin/bakarr-api";
      };
    });

    nixosModules = {
      default = import ./nix/module.nix {inherit self;};
      bakarr = import ./nix/module.nix {inherit self;};
    };

    devShells = forEachSupportedSystem ({pkgs}: {
      default = pkgs.mkShellNoCC {
        packages = with pkgs; [
          nodejs
          pnpm
          ffmpeg
        ];
      };
    });
  };
}
