# Bakarr

Anime library manager monorepo.

## Apps

- `apps/api` - Bun + Effect
- `apps/web` - SolidJS frontend
- `packages/shared` - shared transport/types

## Workspace

- runtime and task runner: `bun`
- workspace config: `package.json` workspaces
- dependencies are installed with Bun

## Common Commands

From the repo root:

```sh
bun run dev
bun run dev:api
bun run dev:web
bun run check
bun run test
bun run build
bun run lint
```

API checks:

```sh
bun run check:api
bun run --cwd apps/api check
bun run --cwd apps/api test
```

Web checks:

```sh
bun run check:web
bun run lint:web
bun run --cwd apps/web build
bun run --cwd apps/web check
```

## Nix

This repo now exposes a Bun-based package and a NixOS module from `flake.nix`.

Build and run locally:

```sh
nix build .#bakarr
nix run .#bakarr-api
```

Inspect flake outputs:

```sh
nix flake show
```

### NixOS service

Import the module and enable the service:

```nix
{
  imports = [ inputs.bakarr.nixosModules.bakarr ];

  services.bakarr = {
    enable = true;
    port = 8000;
    openFirewall = true;

    environment = {
      BAKARR_BOOTSTRAP_USERNAME = "admin";
      SESSION_COOKIE_SECURE = false;
    };
  };
}
```

The systemd service stores state under `/var/lib/bakarr` by default and sets
`DATABASE_FILE=/var/lib/bakarr/bakarr.sqlite`.

## Notes

- API uses SQLite/Drizzle migrations under `apps/api/drizzle`
- frontend talks to the API using contracts from `packages/shared`
- root `.gitignore` excludes local env files, build logs, and SQLite artifacts
