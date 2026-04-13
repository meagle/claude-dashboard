# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Build everything
npm run build

# Run all tests (runs each package's test suite)
npm test

# Run menubar tests only (fastest feedback loop)
npm test -w packages/menubar

# Run a single test file
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SessionCard.test.tsx

# Watch mode for menubar tests
cd packages/menubar && npx vitest

# Build + install hook to ~/.config/claude-dashboard/hook.js
npm run build -w packages/hook && cp packages/hook/dist/hook.js ~/.config/claude-dashboard/hook.js

# Run the app
npm start -w packages/menubar

# Install everything (build + hook + Claude settings.json hooks)
bash scripts/install.sh

# Uninstall
bash scripts/uninstall.sh
```

## Architecture

### Packages

**`packages/hook`** — Claude Code hook script. Compiled by `tsup` into a single self-contained CJS file (`dist/hook.js`) that is copied to `~/.config/claude-dashboard/hook.js`. `@claude-dashboard/shared` is bundled in (not external). Claude Code fires this script on `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `Notification` events. It reads/writes `~/.config/claude-dashboard/sessions.json`.

**`packages/shared`** — Types, sessions.json I/O, and config reader. Used by both hook and menubar. The `Session` type is the canonical shape for everything written to sessions.json. Built by `tsc` to `dist/` (CJS). The menubar renderer resolves this package via a Vite alias pointing directly at `src/index.ts`.

**`packages/menubar`** — Electron tray app. Has two separate TypeScript compilations:
- **Main process** (`tsconfig.main.json`): compiles `src/main.ts`, `src/focusTerminal.ts`, `src/trayIcon.ts` to CJS via `tsc`. Output goes to `dist/`.
- **Renderer process** (`tsconfig.json` + Vite): React app in `src/renderer/`, bundled by Vite to `dist/`. Tests run with Vitest + jsdom.

### Data flow

```
Claude session
  → hook.js fires on each Claude Code hook event
  → upserts session into ~/.config/claude-dashboard/sessions.json
  → chokidar watcher in main.ts detects file change
  → main.ts calls getActiveSessions() + sends 'sessions-update' IPC to popover/detached panel
  → React renderer updates via useSessions() hook
```

### Renderer structure

The renderer (`src/renderer/`) is a React app loaded by the Electron BrowserWindow. Key points:

- **`utils/electron.ts`** — All Electron API access goes through this module. It uses `window.require('electron')` (not an ES import) so Vite doesn't bundle the electron package. Any new renderer code that needs `ipcRenderer` or `clipboard` must import from here, not directly from `'electron'`.
- **`hooks/useIpc.ts`** — Subscribes to `sessions-update` IPC messages from main, returns `{ sessions, cardConfig, home }`.
- **`App.tsx`** — Root component. Detects detached panel mode via `window.location.hash === '#detached'`. Sends `resize-to-fit` IPC after every render so main.ts can shrink the window to content height.
- **`types.ts`** — Renderer-local `SessionRow` and `CardConfig` interfaces. These mirror fields from `packages/shared` but are kept separate (renderer doesn't import shared types directly to avoid bundling Node.js deps).

### Electron-specific constraints

- `isDev` in `main.ts` is determined by `fs.existsSync(path.join(__dirname, 'index.html'))` — NOT `!app.isPackaged`, which is always false when running `electron .` directly.
- Vite build must keep `base: './'` so asset paths are relative and work under `file://`.
- The renderer uses `nodeIntegration: true, contextIsolation: false`. There is no preload script.
- Both the tray popover and the detached panel load the same `index.html`; the panel is identified by `window.location.hash === '#detached'`.

### Testing

Menubar uses Vitest + React Testing Library. The `test.root` in `vite.config.ts` is set to the package root (not Vite's `root: 'src/renderer'`) so test discovery works correctly.

`setupTests.ts` mocks `window.require('electron')` so components can import from `utils/electron.ts` in jsdom. Tests that need to assert on IPC calls import `ipcRenderer` from `'../../utils/electron'` (not from `'electron'`) to get the same mock instance the component uses.

The hook package still uses Jest (separate from the Vitest setup in menubar).

### `sessions.json` schema

Written by hook, read by main process. Each entry is a `Session` object (see `packages/shared/src/types.ts`). Sessions are pruned after `staleSessionMinutes` of inactivity (default 30). The `dismissed` field is set to `true` when a user dismisses a done card — dismissed sessions are filtered out in `getActiveSessions()` in main.ts.
