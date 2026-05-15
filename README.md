# Bakarr

Anime library manager monorepo.

## Apps

- `apps/api` - Node.js + Effect
- `apps/web` - React frontend
- `packages/shared` - shared transport/types

## Workspace

- runtime and task runner: Node.js + `pnpm`
- workspace config: `package.json` workspaces
- dependencies are installed with pnpm

## Common Commands

From the repo root:

```sh
pnpm dev
pnpm dev:api
pnpm dev:web
pnpm check
pnpm test
pnpm build
pnpm lint
```

API checks:

```sh
pnpm check:api
pnpm --filter @bakarr/api check
pnpm --filter @bakarr/api test
```

Web checks:

```sh
pnpm check:web
pnpm --filter @bakarr/web build
pnpm --filter @bakarr/web check
```

## Nix

This repo exposes a Node.js-based package and a NixOS module from `flake.nix`.

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

AniDB episode metadata enrichment is configured in the app UI under
`Settings -> Automation -> Metadata Providers`.

## Notes

- API uses SQLite/Drizzle migrations under `apps/api/drizzle`
- frontend talks to the API using contracts from `packages/shared`
- root `.gitignore` excludes local env files, build logs, and SQLite artifacts
