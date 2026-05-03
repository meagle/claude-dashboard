# Configurable Footer Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `footerStyle: 'default' | 'grid'` setting that switches the session card footer between the existing horizontal layout and a new 6-cell labeled stat grid.

**Architecture:** `footerStyle` is stored in `DashboardConfig.columns` (shared types) and mapped through `main.ts` into `CardConfig` (renderer types). `SessionCard` branches on `cfg.footerStyle` to render either the existing footer or a new `GridFooter` component. The settings panel gains a segmented button control (identical to the theme toggle) to switch styles.

**Tech Stack:** TypeScript, React, Tailwind CSS, Vitest + React Testing Library, Electron IPC

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `footerStyle` to `DashboardConfig.columns` and `DEFAULT_CONFIG` |
| `packages/menubar/src/renderer/types.ts` | Add `footerStyle` to `DashboardConfig.columns` and `CardConfig` |
| `packages/menubar/src/main.ts` | Map `config.columns.footerStyle` into `cardConfig` |
| `packages/menubar/src/renderer/components/__tests__/testUtils.ts` | Add `footerStyle: 'default'` to `defaultCardConfig` |
| `packages/menubar/src/renderer/utils/format.ts` | Add `formatTokensShort` |
| `packages/menubar/src/renderer/utils/format.test.ts` | Tests for `formatTokensShort` |
| `packages/menubar/src/renderer/components/SettingsPanel.tsx` | Add `footerStyle` to form + segmented button UI |
| `packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx` | Test footer style control |
| `packages/menubar/src/renderer/components/SessionCard.tsx` | Add `GridFooter` component + branch |
| `packages/menubar/src/renderer/components/__tests__/SessionCard.test.tsx` | Tests for grid footer |

---

## Task 1: Type plumbing — shared types, renderer types, main.ts, testUtils

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/menubar/src/renderer/types.ts`
- Modify: `packages/menubar/src/main.ts:452-462`
- Modify: `packages/menubar/src/renderer/components/__tests__/testUtils.ts:46-56`

- [ ] **Step 1: Add `footerStyle` to `packages/shared/src/types.ts`**

In the `DashboardConfig.columns` interface (around line 55), add the new field:

```typescript
export interface DashboardConfig {
  columns: {
    elapsedTime: boolean;
    gitBranch: boolean;
    changedFiles: boolean;
    cost: boolean;
    subagents: boolean;
    lastAction: boolean;
    compactPaths: boolean;
    doneFooter: boolean;
    contextInHeader?: boolean;
    footerStyle: 'default' | 'grid';
  };
  // ... rest unchanged
}
```

In `DEFAULT_CONFIG.columns` (around line 78), add the default:

```typescript
export const DEFAULT_CONFIG: DashboardConfig = {
  columns: {
    elapsedTime: true,
    gitBranch: true,
    changedFiles: true,
    cost: false,
    subagents: true,
    lastAction: true,
    compactPaths: true,
    doneFooter: true,
    contextInHeader: false,
    footerStyle: 'default',
  },
  // ... rest unchanged
};
```

- [ ] **Step 2: Add `footerStyle` to `packages/menubar/src/renderer/types.ts`**

In the renderer's local `DashboardConfig.columns` interface (around line 69), add:

```typescript
export interface DashboardConfig {
  columns: {
    gitBranch: boolean;
    changedFiles: boolean;
    subagents: boolean;
    lastAction: boolean;
    compactPaths: boolean;
    cost: boolean;
    doneFooter: boolean;
    footerStyle: 'default' | 'grid';
  };
  staleSessionMinutes: number;
  maxHeight: number;
  theme: 'light' | 'dark';
  notifications: boolean;
  notificationSound: boolean;
}
```

In the `CardConfig` interface (around line 57), add:

```typescript
export interface CardConfig {
  showBranch: boolean;
  showGitSummary: boolean;
  showSubagents: boolean;
  showModel: boolean;
  compactPaths: boolean;
  showCost: boolean;
  showDoneFooter: boolean;
  showContextInMeta: boolean;
  footerStyle: 'default' | 'grid';
  theme: 'light' | 'dark';
}
```

- [ ] **Step 3: Map `footerStyle` in `packages/menubar/src/main.ts`**

In the `cardConfig` object (around line 452), add the mapping after `showContextInMeta`:

```typescript
cardConfig: {
  showBranch: config.columns.gitBranch,
  showGitSummary: config.columns.changedFiles,
  showSubagents: config.columns.subagents,
  showModel: config.columns.lastAction,
  compactPaths: config.columns.compactPaths ?? true,
  showCost: config.columns.cost ?? false,
  showDoneFooter: config.columns.doneFooter ?? true,
  showContextInMeta: config.columns.contextInHeader ?? false,
  footerStyle: config.columns.footerStyle ?? 'default',
  theme: config.theme ?? "light",
},
```

- [ ] **Step 4: Add `footerStyle` to `testUtils.ts` fixture**

In `packages/menubar/src/renderer/components/__tests__/testUtils.ts`, update `defaultCardConfig`:

```typescript
export const defaultCardConfig: CardConfig = {
  showBranch: true,
  showGitSummary: true,
  showSubagents: true,
  showModel: true,
  compactPaths: true,
  showCost: false,
  showDoneFooter: true,
  showContextInMeta: false,
  footerStyle: 'default',
  theme: 'light',
};
```

- [ ] **Step 5: Run all menubar tests to confirm no type errors broke anything**

```bash
cd packages/menubar && npx vitest run
```

Expected: all existing tests pass (no new tests yet — types are structural changes only)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts \
        packages/menubar/src/renderer/types.ts \
        packages/menubar/src/main.ts \
        packages/menubar/src/renderer/components/__tests__/testUtils.ts
git commit -m "feat: add footerStyle field to DashboardConfig, CardConfig, and cardConfig mapping"
```

---

## Task 2: `formatTokensShort` utility

**Files:**
- Modify: `packages/menubar/src/renderer/utils/format.ts`
- Modify: `packages/menubar/src/renderer/utils/format.test.ts`

- [ ] **Step 1: Write the failing tests in `format.test.ts`**

Add `formatTokensShort` to the import line at the top of the file:

```typescript
import { elapsedStr, agoStr, compactPath, compressBranch, ctxBarClass, formatTokensShort } from './format';
```

Add a new `describe` block at the bottom of the file:

```typescript
describe('formatTokensShort', () => {
  it('returns null for null input', () => {
    expect(formatTokensShort(null)).toBeNull();
  });

  it('returns the raw number as string for values under 1000', () => {
    expect(formatTokensShort(500)).toBe('500');
    expect(formatTokensShort(999)).toBe('999');
  });

  it('returns rounded k notation for 1000 and above', () => {
    expect(formatTokensShort(1000)).toBe('1k');
    expect(formatTokensShort(23000)).toBe('23k');
    expect(formatTokensShort(1500)).toBe('2k');
  });

  it('does not include "tok" suffix', () => {
    expect(formatTokensShort(5000)).not.toContain('tok');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/menubar && npx vitest run src/renderer/utils/format.test.ts
```

Expected: FAIL with `formatTokensShort is not a function`

- [ ] **Step 3: Implement `formatTokensShort` in `format.ts`**

Append to `packages/menubar/src/renderer/utils/format.ts`:

```typescript
export function formatTokensShort(totalTokens: number | null): string | null {
  if (totalTokens == null) return null;
  return totalTokens >= 1000 ? `${Math.round(totalTokens / 1000)}k` : `${totalTokens}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd packages/menubar && npx vitest run src/renderer/utils/format.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/menubar/src/renderer/utils/format.ts \
        packages/menubar/src/renderer/utils/format.test.ts
git commit -m "feat: add formatTokensShort utility for grid footer token display"
```

---

## Task 3: SettingsPanel — footer style control

**Files:**
- Modify: `packages/menubar/src/renderer/components/SettingsPanel.tsx`
- Modify: `packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: Write the failing test in `SettingsPanel.test.tsx`**

Add `footerStyle: 'default'` to `mockConfig.columns` (around line 11):

```typescript
const mockConfig = {
  staleSessionMinutes: 30,
  notifications: true,
  notificationSound: true,
  columns: {
    gitBranch: true,
    changedFiles: true,
    subagents: false,
    lastAction: true,
    compactPaths: true,
    cost: false,
    footerStyle: 'default',
  },
};
```

Add a new test at the bottom of the `describe('SettingsPanel')` block:

```typescript
it('saves footerStyle: grid when Grid segment is clicked', async () => {
  render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
  await waitFor(() => screen.getByText('Grid'));
  fireEvent.click(screen.getByText('Grid'));
  await waitFor(() => {
    expect(vi.mocked(ipcRenderer.invoke)).toHaveBeenCalledWith(
      'save-config',
      expect.objectContaining({
        columns: expect.objectContaining({ footerStyle: 'grid' }),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SettingsPanel.test.tsx
```

Expected: FAIL — `Grid` text not found in the component

- [ ] **Step 3: Update `FormState`, `DEFAULTS`, `buildPayload`, and config loader in `SettingsPanel.tsx`**

**`FormState` interface** — add one field:

```typescript
interface FormState {
  staleMinutes: number;
  maxHeight: number;
  theme: "light" | "dark";
  gitBranch: boolean;
  changedFiles: boolean;
  subagents: boolean;
  lastAction: boolean;
  compactPaths: boolean;
  cost: boolean;
  doneFooter: boolean;
  notifications: boolean;
  notificationSound: boolean;
  footerStyle: "default" | "grid";
}
```

**`DEFAULTS` constant** — add the default:

```typescript
const DEFAULTS: FormState = {
  staleMinutes: 30,
  maxHeight: 700,
  theme: "light",
  gitBranch: true,
  changedFiles: true,
  subagents: true,
  lastAction: true,
  compactPaths: true,
  cost: false,
  doneFooter: true,
  notifications: true,
  notificationSound: true,
  footerStyle: "default",
};
```

**`buildPayload` function** — add to the `columns` object:

```typescript
const buildPayload = (f: FormState) => ({
  staleSessionMinutes: Math.max(5, Math.min(480, f.staleMinutes || 30)),
  maxHeight: Math.max(300, Math.min(2400, f.maxHeight || 700)),
  theme: f.theme,
  notifications: f.notifications,
  notificationSound: f.notificationSound,
  columns: {
    gitBranch: f.gitBranch,
    changedFiles: f.changedFiles,
    subagents: f.subagents,
    lastAction: f.lastAction,
    compactPaths: f.compactPaths,
    cost: f.cost,
    doneFooter: f.doneFooter,
    footerStyle: f.footerStyle,
  },
});
```

**`get-config` loader** (inside the `useEffect` that calls `ipcRenderer.invoke("get-config")`) — add the field:

```typescript
ipcRenderer.invoke("get-config").then((config: DashboardConfig) => {
  setForm({
    staleMinutes: config.staleSessionMinutes ?? 30,
    maxHeight: config.maxHeight ?? 700,
    theme: config.theme ?? "light",
    gitBranch: config.columns?.gitBranch ?? true,
    changedFiles: config.columns?.changedFiles ?? true,
    subagents: config.columns?.subagents ?? true,
    lastAction: config.columns?.lastAction ?? true,
    compactPaths: config.columns?.compactPaths ?? true,
    cost: config.columns?.cost ?? false,
    doneFooter: config.columns?.doneFooter ?? true,
    notifications: config.notifications ?? true,
    notificationSound: config.notificationSound ?? true,
    footerStyle: (config.columns?.footerStyle as "default" | "grid" | undefined) ?? "default",
  });
});
```

- [ ] **Step 4: Add the "Footer style" segmented button row to the JSX**

Insert this row just above the existing "Show model & context" row (before the `<div className={ROW}>` that has the `show-model` toggle). The row uses the identical pattern as the Theme toggle:

```tsx
<div className="flex justify-between items-center py-1.75">
  <div className="text-ui text-bright">Footer style</div>
  <div className="flex rounded overflow-hidden border border-line shrink-0">
    {(["default", "grid"] as const).map((s) => (
      <button
        key={s}
        onClick={() => setAndSave("footerStyle", s)}
        className={`px-3 py-0.5 text-ui-sm cursor-pointer border-none transition-colors duration-150 ${
          form.footerStyle === s
            ? "bg-accent text-base font-bold"
            : "bg-edge text-soft hover:text-bright"
        }`}
      >
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SettingsPanel.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/menubar/src/renderer/components/SettingsPanel.tsx \
        packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx
git commit -m "feat: add footer style selector to settings panel"
```

---

## Task 4: SessionCard — grid footer

**Files:**
- Modify: `packages/menubar/src/renderer/components/SessionCard.tsx`
- Modify: `packages/menubar/src/renderer/components/__tests__/SessionCard.test.tsx`

- [ ] **Step 1: Write failing tests in `SessionCard.test.tsx`**

Add a new `describe` block at the bottom of the file:

```typescript
describe('SessionCard — grid footer', () => {
  it('renders labeled TOKENS cell without "tok" suffix', () => {
    renderCard(
      { status: 'active', totalTokens: 23000, toolCount: 9, turns: 3 },
      { footerStyle: 'grid', showCost: true }
    );
    expect(screen.getByText('TOKENS')).toBeInTheDocument();
    expect(screen.getByText('23k')).toBeInTheDocument();
    expect(screen.queryByText(/\btok\b/)).not.toBeInTheDocument();
  });

  it('renders TOOLS and TURNS cells with counts', () => {
    renderCard(
      { status: 'active', toolCount: 5, turns: 2 },
      { footerStyle: 'grid' }
    );
    expect(screen.getByText('TOOLS')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('TURNS')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('omits MODEL cell when showModel is false', () => {
    renderCard(
      { status: 'active', model: 'claude-sonnet-4-6', toolCount: 1 },
      { footerStyle: 'grid', showModel: false }
    );
    expect(screen.queryByText('MODEL')).not.toBeInTheDocument();
  });

  it('omits COST and TOKENS cells when showCost is false', () => {
    renderCard(
      { status: 'active', costUsd: 0.21, totalTokens: 5000, toolCount: 1 },
      { footerStyle: 'grid', showCost: false }
    );
    expect(screen.queryByText('COST')).not.toBeInTheDocument();
    expect(screen.queryByText('TOKENS')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SessionCard.test.tsx
```

Expected: FAIL — `TOKENS`, `TOOLS`, `TURNS`, `MODEL` labels not found (grid footer not implemented yet)

- [ ] **Step 3: Add `formatTokensShort` to the import in `SessionCard.tsx`**

Update the format import at the top of `SessionCard.tsx`:

```typescript
import {
  elapsedStr,
  agoStr,
  compressBranch,
  formatTokens,
  formatTokensShort,
} from "../utils/format";
```

- [ ] **Step 4: Add the `GridFooter` component above `SessionCard` in `SessionCard.tsx`**

Insert this component function before the `SessionCardProps` interface (around line 208). It builds visible cells dynamically so the grid always fills the full card width:

```typescript
function GridFooter({
  session: s,
  cfg,
  isDone,
}: {
  session: SessionRow;
  cfg: CardConfig;
  isDone: boolean;
}) {
  const LABEL = "text-[9px] font-semibold tracking-wider uppercase text-fainter leading-none";
  const VALUE = "text-[12px] font-mono text-soft leading-none";
  const CELL = "flex flex-col items-center gap-[3px]";

  const cells: React.ReactNode[] = [];

  if (cfg.showModel && s.model != null) {
    cells.push(
      <div key="model" className={CELL}>
        <span className={LABEL}>Model</span>
        <span className={`${VALUE} text-accent font-bold`}>{s.model}</span>
      </div>
    );
  }

  if (cfg.showModel && (!isDone || s.contextPct != null)) {
    cells.push(
      <div key="context" className={CELL}>
        <span className={LABEL}>Context</span>
        <div className="flex items-center gap-1">
          <div className="w-9 h-[3px] rounded-full overflow-hidden bg-line/70 shrink-0">
            {s.contextPct != null && (
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(4, s.contextPct))}%`,
                  background:
                    "linear-gradient(90deg, var(--color-accent) 0%, var(--color-tool) 100%)",
                }}
              />
            )}
          </div>
          <span className="text-fainter text-[10px] font-mono tabular-nums leading-none">
            {s.contextPct != null ? `${s.contextPct}%` : ""}
          </span>
        </div>
      </div>
    );
  }

  if (cfg.showCost && (s.costUsd != null || !isDone)) {
    cells.push(
      <div key="cost" className={CELL}>
        <span className={LABEL}>Cost</span>
        <span className={VALUE}>
          {s.costUsd != null ? `$${s.costUsd.toFixed(2)}` : "$—"}
        </span>
      </div>
    );
  }

  if (cfg.showCost && (s.totalTokens != null || !isDone)) {
    cells.push(
      <div key="tokens" className={CELL}>
        <span className={LABEL}>Tokens</span>
        <span className={VALUE}>
          {s.totalTokens != null ? (formatTokensShort(s.totalTokens) ?? "") : "—"}
        </span>
      </div>
    );
  }

  if (s.toolCount > 0) {
    cells.push(
      <div key="tools" className={CELL}>
        <span className={LABEL}>Tools</span>
        <span className={VALUE}>{s.toolCount}</span>
      </div>
    );
  }

  if (s.turns != null && s.turns > 0) {
    cells.push(
      <div key="turns" className={CELL}>
        <span className={LABEL}>Turns</span>
        <span className={VALUE}>{s.turns}</span>
      </div>
    );
  }

  if (cells.length === 0) return null;

  return (
    <div
      className="mt-2.5 border-t border-line pt-2"
      style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
    >
      {cells}
    </div>
  );
}
```

- [ ] **Step 5: Branch on `cfg.footerStyle` in the `footer` const inside `SessionCard`**

Find the `const footer = showFooter ? (` block (around line 482) and wrap the existing JSX in a ternary:

```typescript
const footer = showFooter ? (
  cfg.footerStyle === "grid" ? (
    <GridFooter session={s} cfg={cfg} isDone={isDone} />
  ) : (
    <div className="mt-2.5 border-t border-line pt-2 flex items-center justify-between gap-2">
      {cfg.showModel && s.model && (
        <span className="bg-model-bg text-accent text-ui font-bold px-1.5 py-px rounded-badge shrink-0 font-mono">
          {s.model}
        </span>
      )}
      {cfg.showModel && (!isDone || s.contextPct != null) && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-24 h-1 rounded-full overflow-hidden bg-line/70">
            {s.contextPct != null && (
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(4, s.contextPct))}%`,
                  background:
                    "linear-gradient(90deg, var(--color-accent) 0%, var(--color-tool) 100%)",
                }}
              />
            )}
          </div>
          <span className="text-fainter text-[11px] font-mono tabular-nums shrink-0 w-6 text-right">
            {s.contextPct != null ? `${s.contextPct}%` : ""}
          </span>
        </div>
      )}
      {s.toolCount > 0 && (
        <TokenChip label={`${s.toolCount} tools`} />
      )}
      {cfg.showCost && (s.costUsd != null || !isDone) && (
        <TokenChip label={s.costUsd != null ? `$${s.costUsd.toFixed(2)}` : "$—"} />
      )}
      {cfg.showCost && (s.totalTokens != null || !isDone) && (
        <TokenChip label={s.totalTokens != null ? (formatTokens(s.totalTokens) ?? "") : "— tok"} />
      )}
      {s.turns != null && s.turns > 0 && (
        <TokenChip label={`${s.turns} turns`} />
      )}
    </div>
  )
) : null;
```

- [ ] **Step 6: Run all menubar tests**

```bash
cd packages/menubar && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/menubar/src/renderer/components/SessionCard.tsx \
        packages/menubar/src/renderer/components/__tests__/SessionCard.test.tsx
git commit -m "feat: add grid footer style to SessionCard"
```

---

## Task 5: Build and smoke test

- [ ] **Step 1: Build the app**

```bash
npm run build -w packages/menubar
```

Expected: build completes with no TypeScript errors

- [ ] **Step 2: Run the app and verify**

```bash
npm start -w packages/menubar
```

Open the tray, go to Settings. Confirm:
- "Footer style" row appears with Default/Grid segments, styled like the Theme toggle
- Clicking "Grid" updates immediately (no Save button needed)
- A session card with "Grid" active shows labeled TOKENS cell without "tok"
- Switching back to "Default" restores the original footer
- Existing model, cost, branch toggles still hide/show cells in the grid footer

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all packages pass

- [ ] **Step 4: Final commit (README update)**

Update `README.md` to document the new "Footer style" setting under the settings section. Then commit:

```bash
git add README.md
git commit -m "docs: document configurable footer style setting"
```
