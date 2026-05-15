{
  lib,
  stdenv,
  nodejs,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  cacert,
  ffmpeg,
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
    fetcherVersion = 3;
    hash = "sha256-5HmdMVI9HfE3VmjR5jzjqCrLmL8KAS8hqGQ9p4jmmnU=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    python3
    pkg-config
    makeWrapper
    writableTmpDirAsHomeHook
  ];

  PNPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS = "false";
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  NODE_EXTRA_CA_CERTS = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  npm_config_cafile = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  npm_config_nodedir = "${nodejs}";
  PNPM_CONFIG_CAFILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";

  buildPhase = ''
    runHook preBuild

    pnpm rebuild esbuild better-sqlite3

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
    makeWrapper ${nodejs}/bin/node $out/bin/bakarr-api \
      --add-flags $out/share/bakarr/api/main.js \
      --prefix PATH : ${lib.makeBinPath [ffmpeg]} \
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
