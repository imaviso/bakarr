# Bakarr UI

> **Sonarr but for anime using SolidJS**

## 🧠 Project Context for Agents

This file provides high-level context, conventions, and instructions for AI
agents working on this codebase.

### 🛠 Tech Stack

- **Framework**: [SolidJS](https://www.solidjs.com/) (v1.9+)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**:
  - [SolidUI](https://www.solid-ui.com/) (Beautifully designed components that
    you can copy and paste into your apps. This is an unofficial port of
    shadcn/ui and tremor-raw to Solid. Below are dependencies used for SolidUI.)
  - [Tabler Icons](https://tabler.io/)
  - [Tailwind CSS](https://tailwindcss.com/)
  - [Ark UI](https://ark-ui.com/) (Headless components)
  - [Kobalte](https://kobalte.dev/) (Headless components)
  - `class-variance-authority` & `clsx` & `tailwind-merge` for class management
- **State & Routing**:
  - [TanStack Router](https://tanstack.com/router) (File-based routing)
  - [TanStack Query](https://tanstack.com/query) (Data fetching)
  - [TanStack Form](https://tanstack.com/form)
  - [TanStack Table](https://tanstack.com/table)
- **Validation**: [Valibot](https://valibot.dev/)
- **Linting/Formatting**: TypeScript (`tsc --noEmit`)

### 📂 Project Structure

- **`src/`**: Main source code.
  - **`routes/`**: File-based routes for TanStack Router.
  - **`components/`**: Reusable UI components.
  - **`components/ui/`**: SolidUI / Shadcn primitives.
  - **`libs/`**: Utility functions and libraries.
- **`package.json`**: Dependencies and scripts.
- **`tailwind.config.js`**: Tailwind configuration.
- **`react-bakarr-ui/`**: **Reference Implementation**. A WIP React version of
  this app. Use this to reference logic or UI implementation details when
  porting features.

### ⚡ Common Commands

| Command             | Description                              |
| :------------------ | :--------------------------------------- |
| `bun run dev`       | Start the development server (`vite`)    |
| `bun run build`     | Build for production and run type checks |
| `bun run preview`   | Preview the production build             |
| `bun run typecheck` | Run `tsc --noEmit`                       |
| `bun run check`     | Run type checks                          |

### 🎨 Code Style & Conventions

- **Framework**: SolidJS (v1.9+).
- **Validation**: Valibot.
- **Formatting**: Consistent style (2-space indent).
- **Naming**:
  - Components: `PascalCase` (e.g., `AnimeCard`).
  - Functions/Variables: `camelCase`.
  - Files: `kebab-case` (e.g., `anime-card.tsx`, `use-api.ts`).
- **Components**:
  - Use functional components:
    `export function ComponentName(props: Props) { ... }`.
  - **IMPORTANT**: Do NOT destructure `props` in the function signature or body,
    as this breaks reactivity in SolidJS. Access properties via `props.value`.
  - Place `type Props` or `interface Props` immediately above the component.
- **Styling**:
  - Use **Tailwind CSS**.
  - Use `cn()` utility for class merging.
  - Use **SolidUI** (Shadcn port) components from `@/components/ui`.
  - Use **Tabler Icons**.
- **State Management**:
  - Use **TanStack Query** (`createQuery`, `createMutation`) for server state.
  - Use generic SolidJS signals (`createSignal`) and stores (`createStore`) for
    local state.
- **Routing**:
  - Use **TanStack Router**.
  - Define routes in `src/routes`.
  - Use `createFileRoute` for type-safe routing.
- **Imports**:
  - Use absolute imports with `@/` for packages and `~/` for internal
    components/libs.
  - Sort imports: External packages first, then internal components/libs.

### 🤖 AI Assistant Tips

- **Filesystem**: Always check `package.json` if you are unsure about
  dependencies.
- **UI Editing**: When modifying UI, look for `SolidUI` / `shadcn` components
  first. Do not reinvent standard UI elements (buttons, dialogs, inputs).
