{
  lib,
  stdenvNoCC,
  bun,
  nodejs,
  ffmpeg,
  makeWrapper,
  writableTmpDirAsHomeHook,
  src ? ../.,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
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
        || relPath == "node_modules"
        || relPath == "dist"
        || lib.hasPrefix "node_modules/" relPath
        || lib.hasPrefix "dist/" relPath
        || lib.hasInfix "/node_modules/" relPath
        || lib.hasInfix "/dist/" relPath
        || lib.hasSuffix "/node_modules" relPath
        || lib.hasSuffix "/dist" relPath
      );
  };

  node_modules = stdenvNoCC.mkDerivation {
    pname = "${finalAttrs.pname}-node_modules";
    inherit (finalAttrs) version src;

    impureEnvVars =
      lib.fetchers.proxyImpureEnvVars
      ++ [
        "GIT_PROXY_COMMAND"
        "SOCKS_SERVER"
      ];

    nativeBuildInputs = [
      bun
      writableTmpDirAsHomeHook
    ];

    dontConfigure = true;

    buildPhase = ''
      runHook preBuild

      bun install \
        --cpu="*" \
        --frozen-lockfile \
        --ignore-scripts \
        --no-progress \
        --os="*"

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out

      find . -type d -name node_modules -exec cp -R --parents {} $out \;

      runHook postInstall
    '';

    dontFixup = true;

    outputHash = "sha256-g5HvUwp1K6p//ZTQfKBKCQRhIVyryGS7OzUWG2vvh8g=";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [
    bun
    nodejs
    makeWrapper
    writableTmpDirAsHomeHook
  ];

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

    bun run --cwd apps/web build
    bun run --cwd apps/api generate:embedded-artifacts

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/bakarr
    cp -R . $out/share/bakarr/

    mkdir -p $out/bin
    makeWrapper ${lib.getExe bun} $out/bin/bakarr-api \
      --prefix PATH : ${lib.makeBinPath [ ffmpeg ]} \
      --run 'if [ -z "$DATABASE_FILE" ]; then if [ -n "$XDG_STATE_HOME" ]; then state_home="$XDG_STATE_HOME"; elif [ -n "$HOME" ]; then state_home="$HOME/.local/state"; else state_home="/tmp"; fi; export DATABASE_FILE="$state_home/bakarr/bakarr.sqlite"; fi; mkdir -p "$(dirname "$DATABASE_FILE")"' \
      --add-flags "run $out/share/bakarr/apps/api/main.ts"

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
