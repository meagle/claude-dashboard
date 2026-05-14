# Model Colors Design

**Date:** 2026-05-14  
**Status:** Approved

## Overview

Each Claude model gets a user-configurable color and badge style. The color applies consistently everywhere a model name appears: session card badges, the history panel pill, and history chart segments. Configuration lives in Settings → Models, integrated into the existing context windows table as two new columns.

## Data Model

### `DashboardConfig` (packages/shared/src/types.ts)

```typescript
modelColors?: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
```

Keyed by model prefix (e.g. `"claude-sonnet"`). Prefix-matching uses the same longest-prefix-first logic as `modelContextWindows`. Pre-populated in `DEFAULT_CONFIG`:

```typescript
modelColors: {
  'claude-sonnet': { color: '#D97757', badgeStyle: 'A' },
  'claude-opus':   { color: '#D97757', badgeStyle: 'A' },
  'claude-haiku':  { color: '#D97757', badgeStyle: 'A' },
},
```

`#D97757` is the Claude brand orange — the default for all known models. Users customize per-model from there.

### `CardConfig` (packages/menubar/src/renderer/types.ts)

Add the same `modelColors` field so it flows from IPC config to renderer components.

## Badge Styles

Three styles, each driven by a single configured color:

| Style | Background | Text | Border |
|-------|-----------|------|--------|
| **A — Tinted** | color at 18% opacity | color | none |
| **B — Solid** | color (full) | `#fff` | none |
| **C — Ghost** | color at 12% opacity | color | 1px solid color at 30% opacity |

## Color Utility (new file)

`packages/menubar/src/renderer/utils/modelColors.ts`

- **`modelColorFromConfig(model, modelColors)`** — prefix-matches a model display string against the config map (longest prefix first). Returns `{ color, badgeStyle }` or `null`.
- **`modelBadgeStyle(color, badgeStyle)`** — returns an inline React `CSSProperties` object for the badge. Falls back to the existing teal defaults when called with `null` from `modelColorFromConfig`.

All badge rendering that currently uses `bg-model-bg text-accent` Tailwind classes switches to `style={modelBadgeStyle(...)}`.

## IPC / Config Flow

`modelColors` is loaded and saved via the existing `get-config` / `save-config` IPC handlers — no new IPC needed. `useIpc.ts` passes `modelColors` through in `cardConfig` alongside existing fields.

## Components Affected

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `modelColors` to `DashboardConfig` and `DEFAULT_CONFIG` |
| `packages/menubar/src/renderer/types.ts` | Add `modelColors` to `CardConfig` |
| `packages/menubar/src/renderer/hooks/useIpc.ts` | Pass `modelColors` through from IPC config |
| `packages/menubar/src/renderer/utils/modelColors.ts` | **New** — `modelColorFromConfig`, `modelBadgeStyle` |
| `packages/menubar/src/renderer/components/SessionCard.tsx` | Use `modelBadgeStyle` for footer and grid footer model badges |
| `packages/menubar/src/renderer/components/HistoryPanel.tsx` | Use `modelBadgeStyle` for `MetaPill accent` |
| `packages/menubar/src/renderer/components/HistoryCharts.tsx` | Update `buildModelColors()` to use configured colors with palette fallback |
| `packages/menubar/src/renderer/components/SettingsPanel.tsx` | Add Color + Style columns to `ModelsTab` table |

## Settings Panel — Models Tab

Two new columns added to the existing context windows table:

**Color column:**
- A `16×16` color swatch backed by a hidden `<input type="color">` — clicking the swatch opens the native OS color picker
- An editable hex text input (`#rrggbb`) next to the swatch
- Committing (Enter or blur) validates the format; invalid input is discarded
- Change saves immediately via `save-config`

**Style column:**
- A/B/C toggle buttons
- Clicking one saves immediately
- The selected button is highlighted in the row's configured color (to reinforce which color is active)

**Prefix badge (column 1):**
- Rendered with `modelBadgeStyle()` — reflects the row's current color + style live as the user changes them

**New custom models** added via "Add custom model" default to `{ color: '#D97757', badgeStyle: 'A' }`.

The existing "Reset overrides" button only resets context window values, not colors — color overrides are independent.

## History Charts

`buildModelColors()` in `HistoryCharts.tsx` is updated to:

1. For each unique model string in history rows, prefix-match against `modelColors` config
2. Use the configured color if found
3. Fall back to the existing `PROJECT_PALETTE` assignment for unmatched models

`modelColors` is threaded through from `HistoryPanel` (which receives it via IPC) to `HistoryCharts` as a prop.

## Testing

- Unit tests for `modelColorFromConfig` (prefix matching, longest-prefix wins, null model, no config)
- Unit tests for `modelBadgeStyle` (all three styles, null input falls back to defaults)
- Update `SessionCard` tests to use the new inline style instead of Tailwind class assertions
- Update `SettingsPanel` tests for the new Color and Style columns in `ModelsTab`
