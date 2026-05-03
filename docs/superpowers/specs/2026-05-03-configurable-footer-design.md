# Configurable Footer Style

**Date:** 2026-05-03  
**Status:** Approved

## Overview

Add a `footerStyle` setting that lets users switch the session card footer between the existing horizontal layout ("Default") and a new 6-cell labeled stat grid ("Grid"). Both styles respect the same visibility toggles already in settings.

## Data Model

### `packages/shared/src/types.ts`

Add `footerStyle: 'default' | 'grid'` to `DashboardConfig.columns` and set `DEFAULT_CONFIG.columns.footerStyle = 'default'`.

### `packages/menubar/src/renderer/types.ts`

Add `footerStyle: 'default' | 'grid'` to `CardConfig`.

### `packages/menubar/src/main.ts`

Map `config.columns.footerStyle ?? 'default'` into the `cardConfig` object sent to the renderer via IPC.

## Settings Panel

Add a "Footer style" row in `SettingsPanel.tsx`:

- Uses the same segmented button control as the Theme toggle (Light/Dark)
- Two segments: **Default** | **Grid**
- Positioned just above the "Show model & context" row
- Saves immediately via `setAndSave` (no need to click Save)
- `FormState` gains `footerStyle: 'default' | 'grid'`, set to `'default'` in `DEFAULTS`
- `buildPayload` maps it to `columns.footerStyle`
- The `get-config` loader reads `config.columns.footerStyle ?? 'default'`

## Grid Footer Rendering (`SessionCard.tsx`)

The existing `showFooter` guard logic is unchanged — it determines whether a footer renders at all. Inside the footer block, branch on `cfg.footerStyle`:

- `'default'` → current rendering (unchanged)
- `'grid'` → new 6-cell stat grid

### Grid layout

`display: grid; grid-template-columns: repeat(N, 1fr)` where N is the count of visible cells. Cells always fill the full card width evenly.

### Cell visibility (mirrors current footer rules)

| Cell | Shown when |
|------|-----------|
| MODEL | `cfg.showModel && s.model != null` |
| CONTEXT | `cfg.showModel && (!isDone \|\| s.contextPct != null)` |
| COST | `cfg.showCost && (s.costUsd != null \|\| !isDone)` |
| TOKENS | `cfg.showCost && (s.totalTokens != null \|\| !isDone)` |
| TOOLS | `s.toolCount > 0` |
| TURNS | `s.turns != null && s.turns > 0` |

### Cell anatomy

Each cell is a `flex-direction: column; align-items: center` container with:
- **Label**: 9px, uppercase, letter-spaced, `text-fainter` color
- **Value**: 12px, monospace, `text-soft` color

Special cases:
- MODEL value: accent color + bold (matches current model pill style)
- CONTEXT value: bar and percentage on one line — `display: flex; align-items: center; gap: 4px` — 36px bar + percentage text
- COST value: `$X.XX` or `$—` when unknown
- TOKENS value: uses `formatTokensShort` (no "tok" suffix)

## Token Format Utility

Add `formatTokensShort` to `packages/menubar/src/renderer/utils/format.ts`:

```ts
export function formatTokensShort(totalTokens: number | null): string | null {
  if (totalTokens == null) return null;
  return totalTokens >= 1000 ? `${Math.round(totalTokens / 1000)}k` : `${totalTokens}`;
}
```

The existing `formatTokens` function is unchanged.

## Testing

- **`testUtils.ts`**: add `footerStyle: 'default'` to the shared `CardConfig` fixture
- **`SessionCard.test.tsx`**: test that rendering with `footerStyle: 'grid'` shows TOKENS label and token value without "tok"
- **`SettingsPanel.test.tsx`**: test that clicking "Grid" segment fires `save-config` with `columns.footerStyle: 'grid'`
- **`format.test.ts`**: add cases for `formatTokensShort` (null, sub-1k, 1k+)

## Out of Scope

- Modifying the compact row or one-line row footer (this feature targets `SessionCard` only)
- Adding a third footer style
- Per-card footer style overrides
