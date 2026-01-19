# Bakarr UI

> **Sonarr but for anime using SolidJS**

## 🧠 Project Context for Agents

This file provides high-level context, conventions, and instructions for AI agents working on this codebase.

### 🛠 Tech Stack

- **Framework**: [SolidJS](https://www.solidjs.com/) (v1.9+)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: 
  - [SolidUI] (https://www.solid-ui.com/) (Beautifully designed components that you can copy and paste into your apps. This is an unofficial port of shadcn/ui and tremor-raw to Solid. Below are dependencies used for SolidUI.)
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
- **Linting/Formatting**: [Biome](https://biomejs.dev/)

### 📂 Project Structure

- **`src/`**: Main source code.
  - **`routes/`**: File-based routes for TanStack Router.
- **`package.json`**: Dependencies and scripts.
- **`biome.json`**: Biome configuration.
- **`tailwind.config.js`**: Tailwind configuration.
- **`react-bakarr-ui/`**: **Reference Implementation**. A WIP React version of this app. Use this to reference logic or UI implementation details when porting features.

### ⚡ Common Commands

The project contains both `bun.lock` and `pnpm-lock.yaml`. **Prefer `bun`** for scripts if available, or `pnpm`.

| Command | Description |
| :--- | :--- |
| `bun dev` / `pnpm dev` | Start the development server (`vite`) |
| `bun run build` / `pnpm build` | Build for production (`vite build && tsc`) |
| `bun run serve` / `pnpm serve` | Preview the production build |
| `bun biome check .` | Run linting and formatting checks |
| `bun biome format --write .` | Fix formatting issues |

### 📝 Conventions

1.  **Styling**: Use utility classes (Tailwind) primarily. Use CVA for component variants.
2.  **Routing**: Follow TanStack Router file-based routing conventions in `src/routes`.
3.  **Code Quality**: Ensure code passes Biome checks.
