{
  lib,
  stdenv,
  nodejs_latest,
  node-gyp,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  cacert,
  ffmpeg,
  poppler-utils,
  python3,
  pkg-config,
  makeWrapper,
  writableTmpDirAsHomeHook,
  src ? ../.,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "bakarr";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = src;
    filter = path: type: let
      relPath = lib.removePrefix (toString src + "/") (toString path);
    in
      !(
        lib.hasPrefix ".git" relPath
        || lib.hasPrefix ".direnv" relPath
        || relPath == ".bun"
        || relPath == "node_modules"
        || relPath == "dist"
        || lib.hasPrefix ".bun/" relPath
        || lib.hasPrefix "node_modules/" relPath
        || lib.hasPrefix "dist/" relPath
        || lib.hasInfix "/node_modules/" relPath
        || lib.hasInfix "/dist/" relPath
        || lib.hasSuffix "/node_modules" relPath
        || lib.hasSuffix "/dist" relPath
      );
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm;
    fetcherVersion = 4;
    hash = "sha256-6g7PvQ2sz7uWQEQzIZSwmM0DhbdZGB2iLzTvZbR6YMk=";
    pnpmInstallFlags = ["--config.minimum-release-age=0"];
  };

  nativeBuildInputs = [
    nodejs_latest
    pnpm
    pnpmConfigHook
    python3
    pkg-config
    node-gyp
    makeWrapper
    writableTmpDirAsHomeHook
  ];

  PNPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS = "false";
  PNPM_MINIMUM_RELEASE_AGE = "0";
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  NODE_EXTRA_CA_CERTS = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  npm_config_cafile = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  PNPM_CONFIG_CAFILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";

  buildPhase = ''
    runHook preBuild

    # Rebuild better-sqlite3 against nodejs_latest. nixpkgs node-gyp wrapper
    # hardcodes npm_config_nodedir to pkgs.nodejs (not latest) — bypass it.
    env -u npm_config_nodedir \
      ${nodejs_latest}/bin/node ${node-gyp}/lib/node_modules/node-gyp/bin/node-gyp.js \
        rebuild --release \
        --directory=apps/api/node_modules/better-sqlite3 \
        --nodedir="${nodejs_latest}" \
        --python="$(command -v python3)"

    pnpm --filter @bakarr/web build
    pnpm --filter @bakarr/api build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/bakarr
    cp -R apps/api/build $out/share/bakarr/api
    mkdir -p $out/share/bakarr/node_modules
    cp -RL apps/api/node_modules/better-sqlite3 $out/share/bakarr/node_modules/better-sqlite3
    cp -RL node_modules/.pnpm/bindings@*/node_modules/bindings $out/share/bakarr/node_modules/bindings
    cp -RL node_modules/.pnpm/file-uri-to-path@*/node_modules/file-uri-to-path $out/share/bakarr/node_modules/file-uri-to-path

    mkdir -p $out/bin
    makeWrapper ${nodejs_latest}/bin/node $out/bin/bakarr-api \
      --add-flags $out/share/bakarr/api/main.js \
      --prefix PATH : ${lib.makeBinPath [ffmpeg poppler-utils]} \
      --run 'if [ -z "$DATABASE_FILE" ]; then if [ -n "$XDG_STATE_HOME" ]; then state_home="$XDG_STATE_HOME"; elif [ -n "$HOME" ]; then state_home="$HOME/.local/state"; else state_home="/tmp"; fi; export DATABASE_FILE="$state_home/bakarr/bakarr.sqlite"; fi; mkdir -p "$(dirname "$DATABASE_FILE")"'

    runHook postInstall
  '';

  meta = {
    description = "Bakarr API server";
    homepage = "https://github.com/yunyun/bakarr";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
    mainProgram = "bakarr-api";
    sourceProvenance = with lib.sourceTypes; [fromSource];
  };

  dontFixup = true;
  dontCheckForBrokenSymlinks = true;
})
