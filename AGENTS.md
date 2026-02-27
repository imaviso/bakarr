# Bakarr Agent Guidelines

Project status: pre-release alpha. Do not preserve backward compatibility unless explicitly requested.

This document provides context, commands, and code style guidelines for agents working on the Bakarr codebase. Bakarr is a Sonarr-alternative anime download manager utilizing a Rust backend and a SolidJS (Vite) frontend.

## 🚀 Build & Test Commands

### Backend (Rust)
The root directory contains the Rust backend.
- **Run Dev Server**: `cargo run -- daemon` (Runs the backend daemon)
- **Run CLI Command**: `cargo run -- <command>` (e.g., `cargo run -- list`)
- **Build**: `cargo build`
- **Test**: `cargo test`
- **Run Single Test**: `cargo test test_name_here` (e.g., `cargo test tests::api_tests::test_health_check`)
- **Check/Lint**: `cargo clippy`
- **Format**: `cargo fmt`

### Frontend (SolidJS/Vite)
Located in `bakarr-ui/`.
- **Install Deps**: `bun install`
- **Dev Server**: `bun dev` (Runs Vite)
- **Build**: `bun run build`
- **Check/Lint**: `bun biome check .`
- **Format**: `bun biome format --write .` (Uses Biome)
- **Preview**: `bun run serve`

## 🏗️ Project Structure

- **`/src`**: Rust backend source.
  - `main.rs`: Entry point wrapper.
  - `lib.rs`: Core application logic.
  - `config.rs`, `constants.rs`: Configuration.
  - `state.rs`: Shared application state initialization.
  - `api/`: Axum web server routes (handlers, middleware, error types).
  - `cli/`: CLI command implementations.
  - `clients/`: External API clients (AniList, Nyaa, SeaDex, qBittorrent, etc.).
  - `db/`: Database interactions.
    - `repositories/`: Data access layer for various entities.
    - `migrator/`: SeaORM migrations.
  - `entities/`: SeaORM entity definitions.
  - `services/`: Business logic.
    - `scheduler.rs`: Background task scheduler.
    - `monitor.rs`: Download monitoring and importing logic.
    - `search.rs`: Search logic and caching.
    - `downloader.rs`, `library.rs`, `rss.rs`, etc.
  - `models/`: Domain models and data structures.
  - `parser/`: Filename parsing logic.
  - `quality/`: Quality profile and definition logic.
  - `library/`: Library management and recycle bin logic.
- **`/bakarr-ui`**: Frontend source.
  - `src/routes/`: File-based routing (TanStack Router).
  - `src/components/`: Reusable UI components.
  - `src/components/ui/`: SolidUI / Shadcn primitives.
  - `src/libs/`: Utility functions and libraries.

## 🎨 Code Style Guidelines

### General
- **Functional**: Prefer functional patterns where appropriate.
- **Clean Code**: Keep functions small and focused. Extract logic into services/hooks.
- **Comments**: Comment complex logic, but prefer self-documenting code.

### Rust (Backend)
- **Async/Await**: Heavy usage of `tokio` and `async fn`.
- **Error Handling**: 
  - Use `anyhow::Result` for application code/controllers.
  - Use `thiserror` for library/module-level errors.
  - Context: Use `.context("...")` to provide helpful error messages.
- **Database**: Use `sea-orm` entities and ActiveModels. Prefer strongly typed queries over raw SQL.
- **Imports**: Group imports logically:
  1. `std`
  2. External crates (`tokio`, `tracing`, `anyhow`)
  3. Internal modules (`crate::models`, `crate::services`)
- **Logging**: Use `tracing` (`info!`, `warn!`, `error!`, `debug!`). Do not use `println!` for logs in daemon mode.

### TypeScript / SolidJS (Frontend)
- **Framework**: SolidJS (v1.9+).
- **Validation**: Valibot.
- **Formatting**: Adhere to `biome.json` rules.
- **Naming**:
  - Components: `PascalCase` (e.g., `AnimeCard`).
  - Functions/Variables: `camelCase`.
  - Files: `kebab-case` (e.g., `anime-card.tsx`, `use-api.ts`).
- **Components**:
  - Use functional components: `export function ComponentName(props: Props) { ... }`.
  - **IMPORTANT**: Do NOT destructure `props` in the function signature or body, as this breaks reactivity in SolidJS. Access properties via `props.value`.
  - Place `type Props` or `interface Props` immediately above the component.
- **Styling**: 
  - Use **Tailwind CSS**.
  - Use `cn()` utility for class merging (`clsx` + `tailwind-merge`).
  - Use **SolidUI** (Shadcn port) components from `@/components/ui`.
  - Use **Tabler Icons**.
  - Use **Ark UI** / **Kobalte** for headless primitives when creating new components.
  - Use `class-variance-authority` (CVA) for component variants.
- **State Management**:
  - Use **TanStack Query** (`createQuery`, `createMutation`) for server state.
  - Use **TanStack Form** for complex forms.
  - Use **TanStack Table** for data tables.
  - Use generic SolidJS signals (`createSignal`) and stores (`createStore`) for local state.
- **Routing**:
  - Use **TanStack Router**.
  - Define routes in `src/routes`.
  - Use `createFileRoute` for type-safe routing.
- **Imports**:
  - Use absolute imports with `@/` for packages and `~/` for internal components/libs.
  - Sort imports: External packages first, then internal components/libs.

## 🤖 AI Assistant Tips
- **Filesystem**: Always check `Cargo.toml` or `package.json` if you are unsure about dependencies.
- **Database**: Check `migrations/` folder to understand the DB schema.
- **UI Editing**: When modifying UI, look for `SolidUI` / `shadcn` components first. Do not reinvent standard UI elements (buttons, dialogs, inputs).
