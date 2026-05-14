# Model Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-model configurable color and badge style, applied consistently to session card badges, history panel pills, and history charts, with color/style columns integrated into the existing Models settings table.

**Architecture:** A new `modelColors` key in `DashboardConfig` stores `Record<prefix, { color, badgeStyle }>` using the same longest-prefix-first matching already used by `modelContextWindows`. A new `utils/modelColors.ts` in the renderer provides `modelColorFromConfig` (lookup) and `modelBadgeStyle` (inline style object). The `cardConfig` IPC payload carries `modelColors` to all renderer components; the Models tab settings table gains two new columns (Color, Style) that save to this key.

**Tech Stack:** TypeScript, React, Electron IPC, Vitest + React Testing Library, Tailwind v4 (via CSS variables)

---

### Task 1: Add `modelColors` to shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add `modelColors` to `DashboardConfig`**

In `packages/shared/src/types.ts`, add the field after `modelContextWindows`:

```typescript
modelColors?: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
```

The full `DashboardConfig` interface now ends:
```typescript
  modelContextWindows?: {
    fetched: Record<string, number>;
    custom: Array<{ prefix: string; contextWindow: number }>;
    fetchedAt?: number;
  };
  modelColors?: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
}
```

- [ ] **Step 2: Add defaults to `DEFAULT_CONFIG`**

In `DEFAULT_CONFIG`, add after `showBadgeCount: false`:

```typescript
  modelColors: {
    'claude-sonnet': { color: '#D97757', badgeStyle: 'A' },
    'claude-opus':   { color: '#D97757', badgeStyle: 'A' },
    'claude-haiku':  { color: '#D97757', badgeStyle: 'A' },
  },
```

- [ ] **Step 3: Build and check types compile**

```bash
cd packages/shared && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add modelColors to DashboardConfig with orange defaults"
```

---

### Task 2: Create `utils/modelColors.ts` with tests

**Files:**
- Create: `packages/menubar/src/renderer/utils/modelColors.ts`
- Create: `packages/menubar/src/renderer/utils/modelColors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/menubar/src/renderer/utils/modelColors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { modelColorFromConfig, modelBadgeStyle } from './modelColors';

const COLORS = {
  'claude-sonnet':     { color: '#D97757', badgeStyle: 'A' as const },
  'claude-opus':       { color: '#9a5dc0', badgeStyle: 'B' as const },
  'claude-sonnet-4-6': { color: '#ff0000', badgeStyle: 'C' as const },
};

describe('modelColorFromConfig', () => {
  it('returns null for null model', () => {
    expect(modelColorFromConfig(null, COLORS)).toBeNull();
  });

  it('returns null when no prefix matches', () => {
    expect(modelColorFromConfig('gpt-4', COLORS)).toBeNull();
  });

  it('matches by prefix', () => {
    const result = modelColorFromConfig('claude-opus-4-7', COLORS);
    expect(result).toEqual({ color: '#9a5dc0', badgeStyle: 'B' });
  });

  it('longest prefix wins over shorter', () => {
    // 'claude-sonnet-4-6' is longer than 'claude-sonnet', should win
    const result = modelColorFromConfig('claude-sonnet-4-6-20251022', COLORS);
    expect(result).toEqual({ color: '#ff0000', badgeStyle: 'C' });
  });

  it('shorter prefix matches when longer does not apply', () => {
    const result = modelColorFromConfig('claude-sonnet-4-5', COLORS);
    expect(result).toEqual({ color: '#D97757', badgeStyle: 'A' });
  });

  it('returns null when modelColors is empty', () => {
    expect(modelColorFromConfig('claude-sonnet-4-6', {})).toBeNull();
  });
});

describe('modelBadgeStyle', () => {
  it('returns teal fallback for null entry', () => {
    const style = modelBadgeStyle(null);
    expect(style.color).toBe('#5acce0');
    expect(style.background).toBe('#0a3a42');
  });

  it('style A: tinted background, text color', () => {
    const style = modelBadgeStyle({ color: '#D97757', badgeStyle: 'A' });
    expect(style.color).toBe('#D97757');
    expect(typeof style.background).toBe('string');
    expect((style.background as string)).toContain('rgba');
    expect(style.border).toBeUndefined();
  });

  it('style B: solid background, white text', () => {
    const style = modelBadgeStyle({ color: '#9a5dc0', badgeStyle: 'B' });
    expect(style.background).toBe('#9a5dc0');
    expect(style.color).toBe('#fff');
  });

  it('style C: translucent bg, colored text, colored border', () => {
    const style = modelBadgeStyle({ color: '#4ade70', badgeStyle: 'C' });
    expect(style.color).toBe('#4ade70');
    expect(typeof style.border).toBe('string');
    expect((style.border as string)).toContain('rgba');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/menubar && npx vitest run src/renderer/utils/modelColors.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `utils/modelColors.ts`**

Create `packages/menubar/src/renderer/utils/modelColors.ts`:

```typescript
import type { CSSProperties } from 'react';

type ModelColorEntry = { color: string; badgeStyle: 'A' | 'B' | 'C' };

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function modelColorFromConfig(
  model: string | null,
  modelColors: Record<string, ModelColorEntry>,
): ModelColorEntry | null {
  if (!model) return null;
  const sorted = Object.keys(modelColors).sort((a, b) => b.length - a.length);
  const match = sorted.find((prefix) => model.startsWith(prefix));
  return match ? modelColors[match] : null;
}

export function modelBadgeStyle(entry: ModelColorEntry | null): CSSProperties {
  if (!entry) return { background: '#0a3a42', color: '#5acce0' };
  const { color, badgeStyle } = entry;
  if (badgeStyle === 'B') return { background: color, color: '#fff' };
  if (badgeStyle === 'C') {
    return {
      background: hexToRgba(color, 0.12),
      color,
      border: `1px solid ${hexToRgba(color, 0.30)}`,
    };
  }
  return { background: hexToRgba(color, 0.18), color };
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd packages/menubar && npx vitest run src/renderer/utils/modelColors.test.ts
```
Expected: 10 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/menubar/src/renderer/utils/modelColors.ts packages/menubar/src/renderer/utils/modelColors.test.ts
git commit -m "feat: add modelColorFromConfig and modelBadgeStyle utilities"
```

---

### Task 3: Update `CardConfig`, `useIpc.ts`, and `testUtils.ts`

**Files:**
- Modify: `packages/menubar/src/renderer/types.ts`
- Modify: `packages/menubar/src/renderer/hooks/useIpc.ts`
- Modify: `packages/menubar/src/renderer/components/__tests__/testUtils.ts`

- [ ] **Step 1: Add `modelColors` to `CardConfig`**

In `packages/menubar/src/renderer/types.ts`, add to the `CardConfig` interface after `pinnedPanelOpacity`:

```typescript
  modelColors: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
```

- [ ] **Step 2: Add `modelColors` to `DEFAULT_CARD_CONFIG` in `useIpc.ts`**

In `packages/menubar/src/renderer/hooks/useIpc.ts`, add to `DEFAULT_CARD_CONFIG`:

```typescript
const DEFAULT_CARD_CONFIG: CardConfig = {
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
  pinnedPanelOpacity: 1,
  modelColors: {
    'claude-sonnet': { color: '#D97757', badgeStyle: 'A' },
    'claude-opus':   { color: '#D97757', badgeStyle: 'A' },
    'claude-haiku':  { color: '#D97757', badgeStyle: 'A' },
  },
};
```

- [ ] **Step 3: Add `modelColors` to `defaultCardConfig` in `testUtils.ts`**

In `packages/menubar/src/renderer/components/__tests__/testUtils.ts`, add to `defaultCardConfig`:

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
  pinnedPanelOpacity: 1,
  modelColors: {},
};
```

- [ ] **Step 4: Build check**

```bash
cd packages/menubar && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 5: Run existing tests**

```bash
cd packages/menubar && npx vitest run
```
Expected: all tests pass (type errors would surface here).

- [ ] **Step 6: Commit**

```bash
git add packages/menubar/src/renderer/types.ts packages/menubar/src/renderer/hooks/useIpc.ts packages/menubar/src/renderer/components/__tests__/testUtils.ts
git commit -m "feat: add modelColors to CardConfig and defaults"
```

---

### Task 4: Thread `modelColors` through `main.ts`

**Files:**
- Modify: `packages/menubar/src/main.ts`

- [ ] **Step 1: Add `modelColors` to `buildSessionsPayload`**

In `packages/menubar/src/main.ts`, find the `cardConfig` object in `buildSessionsPayload` (around line 480). Add `modelColors` as the last field:

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
      theme: config.theme ?? 'light',
      pinnedPanelOpacity: config.pinnedPanelOpacity ?? 1,
      modelColors: config.modelColors ?? {},
    },
```

- [ ] **Step 2: Build check**

```bash
cd packages/menubar && npx tsc --noEmit -p tsconfig.main.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/menubar/src/main.ts
git commit -m "feat: thread modelColors from config through cardConfig IPC payload"
```

---

### Task 5: Update `SessionCard.tsx` to use model colors

**Files:**
- Modify: `packages/menubar/src/renderer/components/SessionCard.tsx`
- Modify: `packages/menubar/src/renderer/components/__tests__/SessionCard.test.tsx`

- [ ] **Step 1: Write a failing test for the colored model badge**

In `packages/menubar/src/renderer/components/__tests__/SessionCard.test.tsx`, add a new test:

```typescript
it('applies configured model color to badge via inline style', () => {
  const { container } = renderCard(
    { model: 'claude-sonnet-4-6' },
    {
      showModel: true,
      modelColors: { 'claude-sonnet': { color: '#ff0000', badgeStyle: 'B' } },
    },
  );
  // Style B: background = color, text = white
  const badge = container.querySelector('[data-testid="model-badge"]');
  expect(badge).not.toBeNull();
  expect((badge as HTMLElement).style.background).toBe('rgb(255, 0, 0)');
  expect((badge as HTMLElement).style.color).toBe('rgb(255, 255, 255)');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SessionCard.test.tsx -t "applies configured model color"
```
Expected: FAIL — badge element not found or style not applied.

- [ ] **Step 3: Update imports in `SessionCard.tsx`**

At the top of `packages/menubar/src/renderer/components/SessionCard.tsx`, add:

```typescript
import { modelColorFromConfig, modelBadgeStyle } from '../utils/modelColors';
```

- [ ] **Step 4: Update the default footer model badge (around line 556)**

Replace:
```tsx
{cfg.showModel && s.model && (
  <span className="bg-model-bg text-accent text-ui font-bold px-1.5 py-px rounded-badge shrink-0 font-mono">
    {s.model}
  </span>
)}
```

With:
```tsx
{cfg.showModel && s.model && (
  <span
    data-testid="model-badge"
    className="text-ui font-bold px-1.5 py-px rounded-badge shrink-0 font-mono"
    style={modelBadgeStyle(modelColorFromConfig(s.model, cfg.modelColors))}
  >
    {s.model}
  </span>
)}
```

- [ ] **Step 5: Update the GridFooter model value (around line 201)**

Replace:
```tsx
<span className={`${VALUE} text-accent font-bold`}>{s.model}</span>
```

With:
```tsx
<span
  className={`${VALUE} font-bold`}
  style={{ color: modelColorFromConfig(s.model, cfg.modelColors)?.color ?? '#5acce0' }}
>
  {s.model}
</span>
```

Note: The GridFooter renders text only (not a badge), so we apply only the `color`.

- [ ] **Step 6: Run the new test — should pass**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SessionCard.test.tsx -t "applies configured model color"
```
Expected: PASS.

- [ ] **Step 7: Run all SessionCard tests**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SessionCard.test.tsx
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/menubar/src/renderer/components/SessionCard.tsx packages/menubar/src/renderer/components/__tests__/SessionCard.test.tsx
git commit -m "feat: apply configured model color to session card badges"
```

---

### Task 6: Update `HistoryPanel.tsx` to use model colors

**Files:**
- Modify: `packages/menubar/src/renderer/components/HistoryPanel.tsx`

- [ ] **Step 1: Add import for model color utilities**

At the top of `packages/menubar/src/renderer/components/HistoryPanel.tsx`, add:

```typescript
import { modelColorFromConfig, modelBadgeStyle } from '../utils/modelColors';
```

- [ ] **Step 2: Add `modelColors` prop to `MetaPill`**

Find the `MetaPill` function definition (around line 155) and update it to accept an optional `customStyle` prop:

```tsx
function MetaPill({
  icon, children, accent = false, customStyle,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  accent?: boolean;
  customStyle?: React.CSSProperties;
}) {
  const cls = customStyle
    ? ''
    : accent
    ? 'bg-tool/15 border-tool/40 text-tool'
    : 'bg-line/40 border-edge/60 text-soft';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-badge border ${cls} text-[11px] font-mono leading-none whitespace-nowrap`}
      style={customStyle}
    >
      {icon && <span className="inline-flex items-center text-fainter">{icon}</span>}
      <span className="tabular-nums">{children}</span>
    </span>
  );
}
```

- [ ] **Step 3: Add `modelColors` prop to `HistoryPanel` and `HistoryEntry`**

Find `HistoryPanel`'s props interface (around line 250) and add `modelColors`:

```typescript
interface HistoryPanelProps {
  showCost: boolean;
  home: string;
  modelColors: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
}
```

Find `HistoryEntryProps` (around line 253) and add `modelColors`:

```typescript
interface HistoryEntryProps {
  s: HistoryRow;
  showCost: boolean;
  home: string;
  modelColors: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
}
```

- [ ] **Step 4: Apply model color to the `MetaPill` in `HistoryEntry`**

In `HistoryEntry` (around line 265), update model to use the configured style. Find:

```tsx
{model && <MetaPill accent>{model}</MetaPill>}
```

Replace with:

```tsx
{model && (
  <MetaPill
    customStyle={modelBadgeStyle(modelColorFromConfig(s.model, modelColors))}
  >
    {model}
  </MetaPill>
)}
```

- [ ] **Step 5: Thread `modelColors` from `HistoryPanel` to `HistoryEntry`**

In `HistoryPanel`'s render, find all `<HistoryEntry ... />` calls (around line 673) and add `modelColors`:

```tsx
<HistoryEntry key={s.sessionId} s={s} showCost={showCost} home={home} modelColors={modelColors} />
```

Update the `HistoryPanel` function signature to destructure `modelColors`:

```typescript
export function HistoryPanel({ showCost, home, modelColors }: HistoryPanelProps) {
```

- [ ] **Step 6: Fix the integration test call site**

`HistoryPanel.integration.test.tsx` renders `<HistoryPanel showCost={true} home="/Users/test" />` without `modelColors`. Add the prop to the render call (around line 90):

```tsx
const utils = render(<HistoryPanel showCost={true} home="/Users/test" modelColors={{}} />);
```

- [ ] **Step 7: Build check**

```bash
cd packages/menubar && npx tsc --noEmit -p tsconfig.json
```
Expected: only App.tsx prop error (fixed in Task 8).

- [ ] **Step 8: Run integration test**

```bash
cd packages/menubar && npx vitest run src/renderer/components/HistoryPanel.integration.test.tsx
```
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/menubar/src/renderer/components/HistoryPanel.tsx packages/menubar/src/renderer/components/HistoryPanel.integration.test.tsx
git commit -m "feat: apply configured model color to history panel session pills"
```

---

### Task 7: Update `HistoryCharts.tsx` to use configured model colors

**Files:**
- Modify: `packages/menubar/src/renderer/components/HistoryCharts.tsx`

- [ ] **Step 1: Add import for `modelColorFromConfig`**

At the top of `packages/menubar/src/renderer/components/HistoryCharts.tsx`, add:

```typescript
import { modelColorFromConfig } from '../utils/modelColors';
```

- [ ] **Step 2: Update `buildModelColors` to accept config colors**

Find `buildModelColors` (around line 61) and replace it:

```typescript
function buildModelColors(
  rows: HistoryRow[],
  configColors: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>,
): Record<string, string> {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const k = shortModel(r.model);
    sums.set(k, (sums.get(k) || 0) + (r.costUsd || 0));
  }
  const order = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  // Build shortModelName → configured color via prefix matching on raw model strings
  const configuredColors: Record<string, string> = {};
  for (const r of rows) {
    const shortName = shortModel(r.model);
    if (r.model && !(shortName in configuredColors)) {
      const entry = modelColorFromConfig(r.model, configColors);
      if (entry) configuredColors[shortName] = entry.color;
    }
  }

  const map: Record<string, string> = {};
  order.forEach((shortName, i) => {
    map[shortName] = configuredColors[shortName] ?? PROJECT_PALETTE[i % PROJECT_PALETTE.length];
  });
  return map;
}
```

- [ ] **Step 3: Add `modelColors` prop to `HistoryChartsProps` and `HistoryCharts`**

Find the `HistoryChartsProps` interface and add:

```typescript
interface HistoryChartsProps {
  rows: HistoryRow[];
  onFilter: (f: HistoryChartsFilter) => void;
  presetRange?: RangeKey;
  modelColors: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
}
```

Update the `HistoryCharts` function signature:

```typescript
export function HistoryCharts({ rows, onFilter, presetRange, modelColors }: HistoryChartsProps) {
```

- [ ] **Step 4: Pass `modelColors` to `buildModelColors`**

Find (around line 339):
```typescript
const modelColors = useMemo(() => buildModelColors(rows), [rows]);
```

Replace with (note: rename the local variable to avoid shadowing the prop):
```typescript
const chartModelColors = useMemo(
  () => buildModelColors(rows, modelColors),
  [rows, modelColors],
);
```

Then update all references from `modelColors` to `chartModelColors` within `HistoryCharts`. These are in:
- The `BrushedTimeline` call (prop `modelColors={modelColors}` → `modelColors={chartModelColors}`)
- The `modelSegments` useMemo (`modelColors[k]` → `chartModelColors[k]`)

Specifically, update the `modelSegments` memo (around line 389):
```typescript
const modelSegments = useMemo<DonutSegment[]>(() => {
  const map = new Map<string, DonutSegment>();
  for (const r of agg.inRange) {
    const k = shortModel(r.model);
    const cur = map.get(k) || { key: k, label: k, value: 0, color: chartModelColors[k] || 'var(--color-fainter)' };
    cur.value += r.costUsd || 0;
    map.set(k, cur);
  }
  return [...map.values()].filter(x => x.value > 0).sort((a, b) => b.value - a.value);
}, [agg.inRange, chartModelColors]);
```

And the `BrushedTimeline` call:
```tsx
<BrushedTimeline
  rows={history}
  range={range}
  onRange={setRange}
  projectColors={projectColors}
  modelColors={chartModelColors}
  segmentBy={segmentBy}
  onSelectDay={handleDaySelect}
  selectedDay={selectedDay}
/>
```

- [ ] **Step 5: Build check**

```bash
cd packages/menubar && npx tsc --noEmit -p tsconfig.json
```
Expected: only errors about `HistoryPanel` call site in `App.tsx` (fixed in Task 8).

- [ ] **Step 6: Commit**

```bash
git add packages/menubar/src/renderer/components/HistoryCharts.tsx
git commit -m "feat: use configured model colors in history charts"
```

---

### Task 8: Thread `modelColors` from `App.tsx` to `HistoryPanel`

**Files:**
- Modify: `packages/menubar/src/renderer/App.tsx`

- [ ] **Step 1: Update the `HistoryPanel` call site**

In `packages/menubar/src/renderer/App.tsx`, find (around line 203):

```tsx
<HistoryPanel showCost={cardConfig.showCost} home={home} />
```

Replace with:

```tsx
<HistoryPanel showCost={cardConfig.showCost} home={home} modelColors={cardConfig.modelColors} />
```

- [ ] **Step 2: Build check**

```bash
cd packages/menubar && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
cd packages/menubar && npx vitest run
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/menubar/src/renderer/App.tsx
git commit -m "feat: thread modelColors from cardConfig to HistoryPanel"
```

---

### Task 9: Update `SettingsPanel.tsx` — Color and Style columns in `ModelsTab`

**Files:**
- Modify: `packages/menubar/src/renderer/components/SettingsPanel.tsx`
- Modify: `packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: Write failing tests for the new columns**

In `packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx`, add `modelColors` to `mockConfig` and a test for the color column:

First, update `mockConfig` to include `modelColors`:

```typescript
const mockConfig = {
  // ... existing fields ...
  modelColors: {
    'claude-sonnet-4-6': { color: '#D97757', badgeStyle: 'A' as const },
    'claude-opus-4-6':   { color: '#D97757', badgeStyle: 'A' as const },
  },
};
```

Then add a test:

```typescript
it('renders color hex input for each model row in Models tab', async () => {
  render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
  fireEvent.click(screen.getByText('Models'));
  await waitFor(() => {
    const hexInputs = screen.getAllByDisplayValue('#D97757');
    expect(hexInputs.length).toBeGreaterThan(0);
  });
});

it('renders A/B/C style buttons for each model row in Models tab', async () => {
  render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
  fireEvent.click(screen.getByText('Models'));
  await waitFor(() => {
    const aBtns = screen.getAllByText('A');
    expect(aBtns.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SettingsPanel.test.tsx -t "color hex input|style buttons"
```
Expected: FAIL.

- [ ] **Step 3: Add import for model color utilities in `SettingsPanel.tsx`**

At the top of `packages/menubar/src/renderer/components/SettingsPanel.tsx`, add:

```typescript
import { modelBadgeStyle } from '../utils/modelColors';
```

- [ ] **Step 4: Add state and helpers in `ModelsTab`**

In `ModelsTab`, after the existing `React.useState` declarations (around line 370), add:

```typescript
type ModelColorEntry = { color: string; badgeStyle: 'A' | 'B' | 'C' };
const DEFAULT_MODEL_COLOR: ModelColorEntry = { color: '#D97757', badgeStyle: 'A' };

const [modelColors, setModelColors] = React.useState<Record<string, ModelColorEntry>>({});
// Tracks live hex text edits before commit (keyed by prefix)
const [colorDrafts, setColorDrafts] = React.useState<Record<string, string>>({});
```

- [ ] **Step 5: Load `modelColors` in the existing `useEffect`**

Update the existing `useEffect` that loads context windows to also load `modelColors`:

```typescript
React.useEffect(() => {
  ipcRenderer.invoke('get-config').then((cfg: {
    modelContextWindows?: { fetched?: Record<string, number>; custom?: Array<{ prefix: string; contextWindow: number }>; fetchedAt?: number };
    modelColors?: Record<string, ModelColorEntry>;
  }) => {
    setFetched(cfg.modelContextWindows?.fetched ?? {});
    setCustom(cfg.modelContextWindows?.custom ?? []);
    setFetchedAt(cfg.modelContextWindows?.fetchedAt);
    setModelColors(cfg.modelColors ?? {});
  });
}, []);
```

- [ ] **Step 6: Add color/style save helpers**

In `ModelsTab`, add after `deleteCustom`:

```typescript
const saveModelColors = (next: Record<string, ModelColorEntry>) => {
  setModelColors(next);
  ipcRenderer.invoke('save-config', { modelColors: next }).catch(() => {});
};

const handleColorChange = (prefix: string, color: string) => {
  const existing = modelColors[prefix] ?? DEFAULT_MODEL_COLOR;
  saveModelColors({ ...modelColors, [prefix]: { ...existing, color } });
};

const handleStyleChange = (prefix: string, badgeStyle: 'A' | 'B' | 'C') => {
  const existing = modelColors[prefix] ?? DEFAULT_MODEL_COLOR;
  saveModelColors({ ...modelColors, [prefix]: { ...existing, badgeStyle } });
};

const commitHex = (prefix: string) => {
  const val = colorDrafts[prefix] ?? '';
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    handleColorChange(prefix, val);
  }
  setColorDrafts((prev) => { const next = { ...prev }; delete next[prefix]; return next; });
};
```

- [ ] **Step 7: Update the table header to add Color and Style columns**

Find the `<thead>` in `ModelsTab`'s table (around line 475). Replace:

```tsx
<thead>
  <tr>
    <th className="text-left text-ui-sm text-fainter px-1 pb-1 border-b border-line font-normal">Prefix</th>
    <th className={HDR}>Context window (tokens)</th>
    <th className={HDR}></th>
  </tr>
</thead>
```

With:

```tsx
<thead>
  <tr>
    <th className="text-left text-ui-sm text-fainter px-1 pb-1 border-b border-line font-normal">Prefix</th>
    <th className={HDR}>Context (tokens)</th>
    <th className={HDR}>Color</th>
    <th className={HDR}>Style</th>
    <th className={HDR}></th>
  </tr>
</thead>
```

- [ ] **Step 8: Update each table row to show prefix badge with model color, add Color and Style cells**

Find the row rendering inside `{rows.map((row) => (` (around line 482). Replace the entire `<tr>` with:

```tsx
{rows.map((row) => {
  const colorEntry = modelColors[row.prefix] ?? DEFAULT_MODEL_COLOR;
  const hexDraft = colorDrafts[row.prefix];
  return (
    <tr key={row.prefix} className="group">
      {/* Column 1: Prefix badge — acts as live preview */}
      <td className="text-ui-sm text-left px-1 py-1 border-b border-line/50">
        <span
          className="font-mono text-[10px] px-1 py-0.5 rounded"
          style={modelBadgeStyle(colorEntry)}
        >
          {row.prefix}
        </span>
      </td>

      {/* Column 2: Context window (unchanged) */}
      <td className={CELL}>
        {editPrefix === row.prefix ? (
          <input
            type="number"
            autoFocus
            className={INPUT_CELL}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit(row)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(row); if (e.key === 'Escape') setEditPrefix(null); }}
          />
        ) : (
          <span
            className="cursor-pointer hover:text-bright transition-colors inline-flex items-center gap-1 justify-end w-full"
            onClick={() => { setEditPrefix(row.prefix); setEditValue(String(row.contextWindow)); }}
          >
            {row.contextWindow.toLocaleString('en-US')}
            <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isContextOverridden(row, fetched) ? 'bg-[#d97706]' : 'opacity-0'}`} />
          </span>
        )}
      </td>

      {/* Column 3: Color picker */}
      <td className="text-ui-sm px-1 py-1 border-b border-line/50 text-center">
        <div className="inline-flex items-center gap-1">
          {/* Color swatch — opens native OS picker */}
          <span
            style={{
              width: 16, height: 16, borderRadius: 3,
              background: colorEntry.color,
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'inline-block',
              flexShrink: 0,
            }}
            onClick={() => {
              const el = document.getElementById(`color-input-${row.prefix}`);
              if (el) el.click();
            }}
          />
          <input
            id={`color-input-${row.prefix}`}
            type="color"
            value={colorEntry.color}
            onChange={(e) => handleColorChange(row.prefix, e.target.value)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          />
          {/* Editable hex field */}
          <input
            type="text"
            value={hexDraft ?? colorEntry.color}
            onChange={(e) => setColorDrafts((prev) => ({ ...prev, [row.prefix]: e.target.value }))}
            onBlur={() => commitHex(row.prefix)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitHex(row.prefix); }}
            className="font-mono bg-edge border border-line text-bright rounded focus:outline-none focus:border-accent"
            style={{ width: 56, fontSize: 10, padding: '1px 4px', textAlign: 'center' }}
          />
        </div>
      </td>

      {/* Column 4: Badge style A/B/C */}
      <td className="text-ui-sm px-1 py-1 border-b border-line/50 text-center">
        <div className="inline-flex gap-0.5">
          {(['A', 'B', 'C'] as const).map((s) => {
            const active = colorEntry.badgeStyle === s;
            return (
              <button
                key={s}
                onClick={() => handleStyleChange(row.prefix, s)}
                className="font-mono bg-transparent border cursor-pointer rounded"
                style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  borderColor: active ? colorEntry.color : '#474747',
                  color: active ? colorEntry.color : '#666',
                  background: active ? `rgba(${parseInt(colorEntry.color.slice(1,3),16)},${parseInt(colorEntry.color.slice(3,5),16)},${parseInt(colorEntry.color.slice(5,7),16)},0.15)` : 'transparent',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </td>

      {/* Column 5: Delete (custom rows only) */}
      <td className={`${CELL} w-5`}>
        {row.source === 'custom' && (
          <button
            onClick={() => deleteCustom(row.prefix)}
            className="text-fainter hover:text-danger bg-transparent border-none cursor-pointer text-sm leading-none p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
})}
```

- [ ] **Step 9: Update "Add custom model" to set default color**

Find `handleAdd` (around line 406). Update it to also set a default color for new custom models:

```typescript
const handleAdd = () => {
  if (!addForm.prefix.trim()) return;
  const val = parseInt(addForm.contextWindow, 10);
  const contextWindow = isNaN(val) || val <= 0 ? 200_000 : val;
  const prefix = addForm.prefix.trim();
  const nextCustom = custom.filter((c) => c.prefix !== prefix);
  nextCustom.push({ prefix, contextWindow });
  saveContextWindows(fetched, nextCustom);
  // Set default color for the new model if not already configured
  if (!modelColors[prefix]) {
    saveModelColors({ ...modelColors, [prefix]: DEFAULT_MODEL_COLOR });
  }
  setAddForm({ prefix: '', contextWindow: '' });
  setShowAdd(false);
};
```

- [ ] **Step 10: Run the new SettingsPanel tests**

```bash
cd packages/menubar && npx vitest run src/renderer/components/__tests__/SettingsPanel.test.tsx
```
Expected: all tests pass including the two new ones.

- [ ] **Step 11: Run all tests**

```bash
cd packages/menubar && npx vitest run
```
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add packages/menubar/src/renderer/components/SettingsPanel.tsx packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx
git commit -m "feat: add Color and Style columns to Models tab settings table"
```

---

### Task 10: Final build, full test run, and README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full build**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 2: Full test suite**

```bash
npm test
```
Expected: all tests pass across all packages.

- [ ] **Step 3: Update README**

In `README.md`, find the Models tab section (or add one under Settings) and add a note about model colors. Find where context window overrides are described and add after:

```markdown
**Model colors:** Each model row also has a color swatch and A/B/C style selector. Click the swatch (or edit the hex field) to set a color; the style toggle controls how the badge renders:
- **A** — tinted background with colored text  
- **B** — solid color background with white text  
- **C** — ghost style with translucent background and a colored border  

Colors apply consistently everywhere a model name appears: session card footer badges, history panel session pills, and history chart segments. Default color for all models is `#D97757` (Claude orange).
```

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: document model color configuration in README"
```
