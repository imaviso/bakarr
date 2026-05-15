{
  lib,
  stdenv,
  nodejs,
  pnpm,
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

  node_modules = stdenv.mkDerivation {
    pname = "${finalAttrs.pname}-node_modules";
    inherit (finalAttrs) version src;

    impureEnvVars =
      lib.fetchers.proxyImpureEnvVars
      ++ [
        "GIT_PROXY_COMMAND"
        "SOCKS_SERVER"
      ];

    nativeBuildInputs = [
      nodejs
      pnpm
      python3
      pkg-config
      writableTmpDirAsHomeHook
    ];

    dontConfigure = true;

    PNPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS = "false";
    SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
    NODE_EXTRA_CA_CERTS = "${cacert}/etc/ssl/certs/ca-bundle.crt";
    npm_config_cafile = "${cacert}/etc/ssl/certs/ca-bundle.crt";
    PNPM_CONFIG_CAFILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";

    buildPhase = ''
      runHook preBuild

      pnpm install \
        --child-concurrency=1 \
        --frozen-lockfile \
        --reporter=append-only

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out

      find . -type d -name node_modules -exec cp -R --parents {} $out \;

      runHook postInstall
    '';

    dontFixup = true;

    outputHash = "sha256-mjgxD9Vt+lFq0nz0oNmVLOiUYh5ExGem2Qr/uZQ7xeM=";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    makeWrapper
    writableTmpDirAsHomeHook
  ];

  PNPM_CONFIG_MANAGE_PACKAGE_MANAGER_VERSIONS = "false";
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  NODE_EXTRA_CA_CERTS = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  npm_config_cafile = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  PNPM_CONFIG_CAFILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/. .

    if [ -d node_modules ]; then
      patchShebangs node_modules
    fi

    if [ -d apps/api/node_modules ]; then
      patchShebangs apps/api/node_modules
    fi

    if [ -d apps/web/node_modules ]; then
      patchShebangs apps/web/node_modules
    fi

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    pnpm --filter @bakarr/web build
    pnpm --filter @bakarr/api build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/bakarr
    cp -R apps/api/build $out/share/bakarr/api
    cp -R node_modules $out/share/bakarr/node_modules

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

  dontCheckForBrokenSymlinks = true;
})
