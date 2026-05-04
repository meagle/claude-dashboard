# Pinned Panel Opacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable opacity to the detached ("pinned") panel that fades to semi-transparent when idle and restores to full opacity on hover, with the transparency level set in the Settings panel.

**Architecture:** The `detachedPanel` BrowserWindow gets `transparent: true` so macOS can composite through it. A wrapper `<div>` in `App.tsx` (detached mode only) controls CSS opacity with a 200ms transition on `mouseenter`/`mouseleave`. The opacity setting (`pinnedPanelOpacity`) flows from config.json → `buildSessionsPayload()` → `sessions-update` IPC → `cardConfig` in the renderer.

**Tech Stack:** Electron (BrowserWindow transparency), React (state + CSS), Tailwind CSS (layout classes), Vitest + React Testing Library (tests)

---

## File Map

| File | Change |
|---|---|
| `packages/shared/src/types.ts` | Add `pinnedPanelOpacity?: number` to `DashboardConfig` |
| `packages/menubar/src/renderer/types.ts` | Add `pinnedPanelOpacity: number` to `CardConfig`; add `pinnedPanelOpacity?: number` to `DashboardConfig` |
| `packages/menubar/src/renderer/hooks/useIpc.ts` | Add `pinnedPanelOpacity: 1` and `footerStyle: 'default'` to `DEFAULT_CARD_CONFIG` |
| `packages/menubar/src/renderer/components/__tests__/testUtils.ts` | Add `pinnedPanelOpacity: 1` to `defaultCardConfig` |
| `packages/menubar/src/main.ts` | Add `transparent: true` to `detachedPanel`; add `pinnedPanelOpacity` to `buildSessionsPayload()` |
| `packages/menubar/src/renderer/components/SettingsPanel.tsx` | Add `pinnedPanelOpacity` to `FormState`, `DEFAULTS`, config load, `buildPayload`, and new UI row |
| `packages/menubar/src/renderer/App.tsx` | Add `hovered` state; body transparency effect; replace fragment with wrapper div carrying opacity |
| `packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx` | Update `mockConfig`; add three new opacity tests |
| `packages/menubar/src/renderer/__tests__/App.test.tsx` | **New file** — four tests for detached opacity behavior |

---

## Task 1: Update Types and Defaults

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/menubar/src/renderer/types.ts`
- Modify: `packages/menubar/src/renderer/hooks/useIpc.ts`
- Modify: `packages/menubar/src/renderer/components/__tests__/testUtils.ts`

These are pure type and constant changes with no new logic. Run the existing test suite after to verify nothing broke.

- [ ] **Step 1: Add `pinnedPanelOpacity` to shared `DashboardConfig`**

In `packages/shared/src/types.ts`, add the optional field to `DashboardConfig` (around line 68, before the closing brace):

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
  staleSessionMinutes: number;
  maxHeight: number;
  theme: 'light' | 'dark';
  notifications: boolean;
  notificationSound: boolean;
  pinnedPanelOpacity?: number;
}
```

- [ ] **Step 2: Add `pinnedPanelOpacity` to renderer `CardConfig` and `DashboardConfig`**

In `packages/menubar/src/renderer/types.ts`, add the field to both interfaces:

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
  pinnedPanelOpacity: number;
}

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
  pinnedPanelOpacity?: number;
}
```

- [ ] **Step 3: Add `pinnedPanelOpacity` and `footerStyle` to `DEFAULT_CARD_CONFIG`**

In `packages/menubar/src/renderer/hooks/useIpc.ts`, update the constant (`footerStyle` was missing from the default — fix it here too):

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
};
```

- [ ] **Step 4: Add `pinnedPanelOpacity` to `defaultCardConfig` in test utils**

In `packages/menubar/src/renderer/components/__tests__/testUtils.ts`:

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
};
```

- [ ] **Step 5: Run all tests and verify they pass**

```bash
cd /Users/meagle/code/claude-dashboard && npm test -w packages/menubar
```

Expected: all existing tests pass. TypeScript errors about missing `pinnedPanelOpacity` on `CardConfig` would appear here — the edits above should prevent them.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts \
        packages/menubar/src/renderer/types.ts \
        packages/menubar/src/renderer/hooks/useIpc.ts \
        packages/menubar/src/renderer/components/__tests__/testUtils.ts
git commit -m "feat: add pinnedPanelOpacity to CardConfig and DashboardConfig types"
```

---

## Task 2: Wire Through `main.ts`

**Files:**
- Modify: `packages/menubar/src/main.ts`

No unit tests for Electron main process changes. Verify manually after Task 4 by running the app.

- [ ] **Step 1: Add `transparent: true` to `detachedPanel` BrowserWindow**

In `packages/menubar/src/main.ts` around line 674, update the `new BrowserWindow({...})` call:

```typescript
detachedPanel = new BrowserWindow({
  width: panelW,
  height: panelH,
  ...(windowState.panelX != null && windowState.panelY != null
    ? { x: windowState.panelX, y: windowState.panelY }
    : {}),
  minWidth: currentMinWidth,
  minHeight: MIN_HEIGHT_COMPACT,
  show: true,
  frame: false,
  resizable: true,
  alwaysOnTop: true,
  transparent: true,
  webPreferences: { nodeIntegration: true, contextIsolation: false },
});
```

- [ ] **Step 2: Add `pinnedPanelOpacity` to `buildSessionsPayload()`**

In `packages/menubar/src/main.ts`, update the `cardConfig` object inside `buildSessionsPayload()` (around line 452):

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
  pinnedPanelOpacity: config.pinnedPanelOpacity ?? 1,
},
```

- [ ] **Step 3: Commit**

```bash
git add packages/menubar/src/main.ts
git commit -m "feat: add transparent:true to detachedPanel and wire pinnedPanelOpacity through payload"
```

---

## Task 3: Settings Panel UI

**Files:**
- Modify: `packages/menubar/src/renderer/components/SettingsPanel.tsx`
- Modify: `packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx`

Write the failing tests first, then implement.

- [ ] **Step 1: Add `pinnedPanelOpacity` to `mockConfig` and write failing tests**

In `packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx`, update `mockConfig` and add three tests at the end of the `describe` block:

```typescript
const mockConfig = {
  staleSessionMinutes: 30,
  notifications: true,
  notificationSound: true,
  pinnedPanelOpacity: 1,
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

Add these tests inside the existing `describe('SettingsPanel', ...)` block:

```typescript
it('renders all four opacity options', async () => {
  render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
  await waitFor(() => {
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});

it('saves pinnedPanelOpacity: 0.5 when 50% is clicked', async () => {
  render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
  await waitFor(() => screen.getByText('50%'));
  fireEvent.click(screen.getByText('50%'));
  await waitFor(() => {
    expect(vi.mocked(ipcRenderer.invoke)).toHaveBeenCalledWith(
      'save-config',
      expect.objectContaining({ pinnedPanelOpacity: 0.5 })
    );
  });
});

it('saves pinnedPanelOpacity: 0.25 when 25% is clicked', async () => {
  render(<SettingsPanel onSave={vi.fn()} onCancel={vi.fn()} onThemeChange={vi.fn()} />);
  await waitFor(() => screen.getByText('25%'));
  fireEvent.click(screen.getByText('25%'));
  await waitFor(() => {
    expect(vi.mocked(ipcRenderer.invoke)).toHaveBeenCalledWith(
      'save-config',
      expect.objectContaining({ pinnedPanelOpacity: 0.25 })
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/meagle/code/claude-dashboard && npx vitest run packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx
```

Expected: the three new tests FAIL (None/75%/50%/25% not found in DOM, save-config not called with opacity).

- [ ] **Step 3: Add `pinnedPanelOpacity` to `FormState` and `DEFAULTS`**

In `packages/menubar/src/renderer/components/SettingsPanel.tsx`, update the interface and constant:

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
  pinnedPanelOpacity: number;
}

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
  pinnedPanelOpacity: 1,
};
```

- [ ] **Step 4: Add `pinnedPanelOpacity` to the config load `useEffect` and `buildPayload`**

In `packages/menubar/src/renderer/components/SettingsPanel.tsx`, update the `useEffect` that calls `get-config` — add this line to the `setForm({...})` call:

```typescript
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
  pinnedPanelOpacity: config.pinnedPanelOpacity ?? 1,
});
```

Update `buildPayload` to include the new field at the top level (not inside `columns`):

```typescript
const buildPayload = (f: FormState) => ({
  staleSessionMinutes: Math.max(5, Math.min(480, f.staleMinutes || 30)),
  maxHeight: Math.max(300, Math.min(2400, f.maxHeight || 700)),
  theme: f.theme,
  notifications: f.notifications,
  notificationSound: f.notificationSound,
  pinnedPanelOpacity: f.pinnedPanelOpacity,
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

- [ ] **Step 5: Add the opacity options constant and UI row**

Near the top of `SettingsPanel` (before the `return`), add the options array:

```typescript
const OPACITY_OPTIONS: { label: string; value: number }[] = [
  { label: "None", value: 1 },
  { label: "75%", value: 0.75 },
  { label: "50%", value: 0.5 },
  { label: "25%", value: 0.25 },
];
```

In the JSX, add the new row **immediately after** the Theme row (before the first `<hr />`):

```tsx
{/* Pinned panel opacity */}
<div className="flex justify-between items-center py-1.75">
  <div className="text-ui text-bright">Pinned panel opacity</div>
  <div className="flex rounded overflow-hidden border border-line shrink-0">
    {OPACITY_OPTIONS.map(({ label, value }) => (
      <button
        key={label}
        onClick={() => setAndSave("pinnedPanelOpacity", value)}
        className={`px-3 py-0.5 text-ui-sm cursor-pointer border-none transition-colors duration-150 ${
          form.pinnedPanelOpacity === value
            ? "bg-accent text-base font-bold"
            : "bg-edge text-soft hover:text-bright"
        }`}
      >
        {label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 6: Run tests and verify all pass**

```bash
cd /Users/meagle/code/claude-dashboard && npx vitest run packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx
```

Expected: all 9 tests pass (6 original + 3 new).

- [ ] **Step 7: Commit**

```bash
git add packages/menubar/src/renderer/components/SettingsPanel.tsx \
        packages/menubar/src/renderer/components/__tests__/SettingsPanel.test.tsx
git commit -m "feat: add pinned panel opacity setting to SettingsPanel"
```

---

## Task 4: App Hover Opacity

**Files:**
- Modify: `packages/menubar/src/renderer/App.tsx`
- Create: `packages/menubar/src/renderer/__tests__/App.test.tsx`

Write failing tests first, then implement.

- [ ] **Step 1: Create the failing test file**

Create `packages/menubar/src/renderer/__tests__/App.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { ipcRenderer } from '../utils/electron';
import { App } from '../App';
import { CardConfig } from '../types';

const baseCardConfig: CardConfig = {
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
};

function setupSessionsHandler() {
  let handler: ((_: unknown, data: unknown) => void) | null = null;
  vi.mocked(ipcRenderer.on).mockImplementation((channel: string, h: unknown) => {
    if (channel === 'sessions-update') handler = h as typeof handler;
  });
  return { getHandler: () => handler };
}

function emitSessions(handler: ((_: unknown, data: unknown) => void) | null, pinnedPanelOpacity: number) {
  act(() => {
    handler?.(null, {
      sessions: [],
      cardConfig: { ...baseCardConfig, pinnedPanelOpacity },
      home: '/Users/test',
    });
  });
}

beforeEach(() => {
  vi.mocked(ipcRenderer.invoke).mockResolvedValue({});
  vi.mocked(ipcRenderer.send).mockReturnValue(undefined);
  vi.mocked(ipcRenderer.off).mockReturnValue(undefined as ReturnType<typeof ipcRenderer.off>);
});

afterEach(() => {
  window.location.hash = '';
  document.body.style.background = '';
});

describe('App pinned panel opacity', () => {
  it('applies configured idle opacity in detached mode when not hovered', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.5');
  });

  it('restores full opacity on mouseenter in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(wrapper.style.opacity).toBe('1');
  });

  it('returns to idle opacity on mouseleave in detached mode', () => {
    window.location.hash = '#detached';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.5);

    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseLeave(wrapper);
    expect(wrapper.style.opacity).toBe('0.5');
  });

  it('does not apply reduced opacity when not in detached mode', () => {
    window.location.hash = '';
    const { getHandler } = setupSessionsHandler();
    const { container } = render(<App />);
    emitSessions(getHandler(), 0.25);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/meagle/code/claude-dashboard && npx vitest run packages/menubar/src/renderer/__tests__/App.test.tsx
```

Expected: all four tests FAIL (App renders a fragment, no wrapper with opacity style).

- [ ] **Step 3: Update `App.tsx` — add `hovered` state and body transparency effect**

In `packages/menubar/src/renderer/App.tsx`, add `hovered` to the state declarations (after `alwaysOnTop`):

```typescript
const [hovered, setHovered] = useState(false);
```

Add a new `useEffect` after the existing theme `useEffect` (after the `applyTheme` call):

```typescript
useEffect(() => {
  if (isDetached) {
    document.body.style.background = "transparent";
  }
}, [isDetached]);
```

- [ ] **Step 4: Replace the fragment return with a wrapper div**

In `packages/menubar/src/renderer/App.tsx`, replace the `return (` block. The current return is:

```tsx
return (
  <>
    <Header ... />
    {settingsOpen ? ( ... ) : historyOpen ? ( ... ) : (
      <div id="sessions" ...>
        ...
      </div>
    )}
  </>
);
```

Replace with (preserve all existing JSX inside, only change the outer wrapper):

```tsx
const idleOpacity = isDetached ? (cardConfig.pinnedPanelOpacity ?? 1) : 1;

return (
  <div
    className="flex flex-col flex-1 min-h-0 bg-base"
    style={{
      opacity: hovered ? 1 : idleOpacity,
      transition: "opacity 200ms ease",
    }}
    onMouseEnter={isDetached ? () => setHovered(true) : undefined}
    onMouseLeave={isDetached ? () => setHovered(false) : undefined}
  >
    <Header
      isDetached={isDetached}
      isSettingsOpen={settingsOpen}
      isHistoryOpen={historyOpen}
      viewMode={viewMode}
      alwaysOnTop={alwaysOnTop}
      onSettingsToggle={handleSettingsToggle}
      onHistoryToggle={handleHistoryToggle}
      onViewModeChange={handleViewModeChange}
      onPopout={handlePopout}
      onPinToggle={handlePinToggle}
      onClose={handleClose}
      sessions={sessions}
    />
    {settingsOpen ? (
      <SettingsPanel
        onSave={() => {
          setSettingsOpen(false);
          ipcRenderer.send("resize-to-fit");
        }}
        onCancel={() => setSettingsOpen(false)}
        onThemeChange={applyTheme}
      />
    ) : historyOpen ? (
      <HistoryPanel showCost={cardConfig.showCost} home={home} />
    ) : (
      <div
        id="sessions"
        className={`flex flex-col overflow-y-auto flex-1 min-h-0 ${viewMode !== "card" ? "overflow-x-hidden" : "gap-1.5 px-2 pt-1.5"}`}
      >
        <SessionList
          sessions={sessions}
          cardConfig={cardConfig}
          home={home}
          viewMode={viewMode}
        />
      </div>
    )}
  </div>
);
```

- [ ] **Step 5: Run the new App tests and verify they pass**

```bash
cd /Users/meagle/code/claude-dashboard && npx vitest run packages/menubar/src/renderer/__tests__/App.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
cd /Users/meagle/code/claude-dashboard && npm test -w packages/menubar
```

Expected: all tests pass. If any component test fails due to `App` now returning a `<div>` instead of a fragment, check whether that test renders `<App>` directly — the wrapper div is a layout-transparent change but any test doing `container.firstChild` type assertions may need updating.

- [ ] **Step 7: Commit**

```bash
git add packages/menubar/src/renderer/App.tsx \
        packages/menubar/src/renderer/__tests__/App.test.tsx
git commit -m "feat: add hover-restore opacity to detached panel in App"
```

---

## Manual Verification

After all tasks are committed, verify end-to-end:

1. Build and start the app: `npm run build -w packages/menubar && npm start -w packages/menubar`
2. Open the tray popover → click the popout/pin button to open the detached panel
3. Open Settings → confirm "Pinned panel opacity" row appears after "Theme"
4. Select "50%" → the detached panel should immediately fade to 50% opacity
5. Move mouse onto the panel → it should snap to 100% opacity with a smooth transition
6. Move mouse off → it should return to 50% with a smooth transition
7. Select "None" → panel should always be fully opaque (no hover effect visible)
8. Verify the tray popover is unaffected (always fully opaque)
