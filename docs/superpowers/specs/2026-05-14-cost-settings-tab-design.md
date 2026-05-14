# Cost Settings Tab Design

**Date:** 2026-05-14
**Status:** Approved

## Problem

Model pricing is hardcoded in `packages/hook/src/hook.ts` with no way for users to adjust values if Anthropic changes prices or if they use a custom proxy model. The "Show session cost" toggle is buried in General settings with no context about where the prices come from.

## Solution

Add a **Cost tab** to the Settings panel alongside a new General tab (existing settings). The Cost tab shows the live pricing table, auto-fetches updates from LiteLLM on startup, allows inline editing of any row, and lets users add custom model prefixes. The existing "Show session cost" toggle moves here.

---

## Data Model

**New fields added to `DashboardConfig`** in `packages/shared/src/types.ts`:

```typescript
export interface ModelPricingEntry {
  input: number;      // per million tokens
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

// Added to DashboardConfig:
modelPricing?: {
  fetched: Record<string, ModelPricingEntry>; // prefix → prices, populated by LiteLLM fetch
  custom: Array<{ prefix: string } & ModelPricingEntry>; // user edits/additions
  fetchedAt?: number; // unix ms timestamp of last successful fetch
};
```

- **`fetched`**: keyed by model prefix (e.g. `claude-sonnet-4`), derived by stripping the patch version from LiteLLM's full model IDs. Never modified by user actions — refresh can overwrite freely.
- **`custom`**: user-created entries and inline edits to fetched rows. Takes precedence over `fetched`. Ordered array so first match wins.
- Inline editing a fetched row writes a new entry into `custom[]` with the same prefix — the original `fetched` entry is untouched, so refreshes don't overwrite user edits.

---

## Fetch Behavior

**Where:** `packages/menubar/src/main.ts`, on `app.whenReady()` — async, non-blocking.

**Source URL:** `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`

**Logic:**
1. Skip fetch if `config.modelPricing.fetchedAt` exists and is less than 24 hours old
2. Fetch JSON, filter to keys starting with `claude-`
3. Convert per-token costs → per-million (multiply by 1,000,000)
4. Group by prefix (strip last `-N` segment from model ID, e.g. `claude-sonnet-4-5` → `claude-sonnet-4`); average prices within each prefix group
5. Write result to `config.modelPricing.fetched` + `fetchedAt` via existing `save-config` IPC path
6. On any failure: log to console, keep existing fetched data, fall back to hardcoded at runtime

**Manual refresh:** New IPC handler `refresh-pricing` in `main.ts` — force re-fetch ignoring the 24h cache, triggered by the "↻ Refresh" button in the Cost tab.

---

## Hook Lookup

`packages/hook/src/hook.ts` — the hook already reads `config.json` at startup.

New lookup order in `modelPricing()`:
1. `config.modelPricing.custom[]` — find first entry where `modelId.startsWith(entry.prefix)`
2. `config.modelPricing.fetched` — find entry where `modelId.startsWith(prefix)`
3. Existing hardcoded `MODEL_PRICING` table — unchanged fallback

No other hook changes.

---

## Settings UI

### Tab bar

`SettingsPanel.tsx` adds a `activeTab: 'general' | 'cost'` state. A tab bar renders above the content area with two tabs: **General** and **Cost**. Existing settings content is wrapped under `activeTab === 'general'`.

The existing "Show session cost" toggle (`config.columns.cost`) is **removed from General** and added to the bottom of the Cost tab.

### Cost tab layout

```
┌─────────────────────────────────────────────────────┐
│ [General]  [Cost ●]                                 │  ← tab bar
├─────────────────────────────────────────────────────┤
│ ℹ API list prices fetched from LiteLLM. Custom      │  ← info note
│   entries override fetched prices.                  │
│                                                     │
│ Model Pricing          Updated 2h ago  ↻ Refresh   │  ← section header
│ ──────────────────────────────────────────────────  │
│ claude-opus-4   [fetched]  $15  $18.75  $1.50  $75 │  ← editable inline
│ claude-sonnet-4 [fetched]  $3   $3.75   $0.30  $15 │
│ claude-haiku-4  [fetched]  $0.80 $1.00  $0.08  $4  │
│ ...                                                 │
│ my-proxy        [custom]   $1   $1.25   $0.10  $5  │  ← deletable
│                                                     │
│ [+ Add custom model]                                │
│                                                     │
│ ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──  │
│ Show cost in session cards              [toggle]    │
│ API billing only — not available on                 │
│ Pro or Max subscriptions                            │
└─────────────────────────────────────────────────────┘
```

### Inline editing

Clicking any price cell (input, cacheWrite, cacheRead, output) replaces it with a number input. On blur or Enter, the value is saved:
- If the row is `fetched`: write a new `custom[]` entry with the same prefix and all four prices (preserving the three unedited values from the fetched row)
- If the row is already `custom`: update in place

### Add custom model form

Expands inline below the table (no modal). Fields:
- **Model prefix** (text, e.g. `my-proxy-model`)
- **Input $/M**, **Output $/M**, **Cache write $/M**, **Cache read $/M** (number inputs)
- Cancel / Add buttons

On Add: appends to `custom[]`, saves config, collapses form.

### Delete

Custom rows have a `×` button. Fetched rows have no delete (they repopulate on refresh anyway).

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `ModelPricingEntry` type, add `modelPricing` + `fetchedAt` to `DashboardConfig` |
| `packages/menubar/src/main.ts` | Add startup fetch, add `refresh-pricing` IPC handler |
| `packages/menubar/src/renderer/components/SettingsPanel.tsx` | Add tab bar, wrap existing content in General tab, add Cost tab |
| `packages/hook/src/hook.ts` | Update `modelPricing()` lookup to check config before hardcoded table |
| `packages/hook/src/__tests__/hook.test.ts` | Update fixtures for new `DashboardConfig` shape if needed |
| `packages/shared/src/__tests__/sessions.test.ts` | Update fixtures if needed |

---

## Testing

1. **Fetch:** On app start, `config.json` gains `modelPricing.fetched` entries with correct per-million values. Re-launch within 24h skips the fetch.
2. **Refresh button:** Clicking "↻ Refresh" in the Cost tab triggers a fresh fetch and updates the table.
3. **Inline edit:** Edit a fetched row price → saved as a `custom` entry. Verify hook uses the custom value for cost calculation on the next session.
4. **Add custom model:** Add a prefix not in the fetched list → appears in table with `custom` badge → hook uses it for matching model IDs.
5. **Delete:** Remove a custom row → reverts to fetched price (if one exists) or zero.
6. **Fallback:** Disable network (or point to bad URL) → app starts without error, hardcoded prices still work.
7. **Show cost toggle:** Toggle moves to Cost tab, still controls `config.columns.cost` as before.
