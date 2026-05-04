# Pinned Panel Opacity — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

## Goal

Let users configure the detached ("pinned") panel to be semi-transparent when idle, so content behind it (editor, terminal, other apps) remains visible. Hovering over any part of the panel instantly restores full opacity.

## Setting

| Config key | Type | Default | Values |
|---|---|---|---|
| `pinnedPanelOpacity` | `number` | `1` (None) | `1`, `0.75`, `0.5`, `0.25` |

Stored in `~/.config/claude-dashboard/config.json` via the existing `save-config` IPC handler. Only applies to the detached panel (`#detached` window); the tray popover is unaffected.

## Settings UI

A new row is added to `SettingsPanel.tsx` **after the Theme row**, before the first `<hr />`:

```
Pinned panel opacity     [ None | 75% | 50% | 25% ]
```

- Uses the same segmented button pattern as Theme and Footer style.
- Saves immediately via `setAndSave` (no Save button press required).
- Label-to-value mapping: `None → 1`, `75% → 0.75`, `50% → 0.5`, `25% → 0.25`.

## Window Setup

Add `transparent: true` to the `detachedPanel` BrowserWindow in `main.ts`. This is required for macOS to composite the window against content behind it — without it, the background colour blocks anything underneath regardless of CSS opacity. `transparent: true` must be set at window creation time; it cannot be changed dynamically.

Side effect: the window drop-shadow disappears, which is acceptable (and arguably nicer) for a floating overlay.

## Renderer — Opacity Application

### Body transparency (detached mode only)

In `App.tsx`, a `useEffect` sets `document.body.style.background = 'transparent'` when `isDetached` is true. This ensures the OS sees a transparent background to composite against, rather than the solid `var(--color-base)` colour.

### Wrapper div

The App's `return` value is wrapped in a single div (replaces the existing fragment) that carries:

- `background: var(--color-base)` — restores the surface colour that the body can no longer provide
- `opacity` — `pinnedPanelOpacity` when not hovered, `1` when hovered
- `transition: opacity 200ms ease` — smooth fade on mouse in/out
- `onMouseEnter` / `onMouseLeave` — React state `hovered: boolean`

The wrapper div is always present. In non-detached mode `pinnedPanelOpacity` is always `1`, so there is no visual change and no opacity toggling.

### Data flow

```
User picks opacity in Settings
  → setAndSave("pinnedPanelOpacity", value)
  → save-config IPC writes config.json
  → chokidar watcher detects change
  → buildSessionsPayload() re-runs (reads new value)
  → sessions-update sent to detachedPanel with new pinnedPanelOpacity
  → useIpc returns updated cardConfig
  → App re-renders with new idle opacity
```

No IPC per hover event — hover is handled entirely in React/CSS.

## Files Changed

| File | Change |
|---|---|
| `packages/menubar/src/renderer/types.ts` | Add `pinnedPanelOpacity: number` to `CardConfig`; add `pinnedPanelOpacity?: number` to `DashboardConfig` |
| `packages/menubar/src/main.ts` | Add `transparent: true` to `detachedPanel`; add `pinnedPanelOpacity` to `buildSessionsPayload()` cardConfig |
| `packages/menubar/src/renderer/components/SettingsPanel.tsx` | Add `pinnedPanelOpacity` to `FormState`, `DEFAULTS`, `buildPayload`, and new UI row |
| `packages/menubar/src/renderer/App.tsx` | Add `hovered` state; body transparency effect in detached mode; wrapper div with opacity + transition |

## Testing

- **`SettingsPanel.test.tsx`** — assert the opacity row renders with all four options; assert `setAndSave` is called with the correct numeric value when each option is selected.
- **`App.test.tsx`** (or existing test file) — in detached mode with `pinnedPanelOpacity < 1`, assert the wrapper has the reduced opacity; assert it becomes `1` when `mouseenter` fires.

## Out of Scope

- Opacity on the tray popover window.
- Animated or click-through (ignore-mouse-events) behaviour.
- Per-session opacity overrides.
