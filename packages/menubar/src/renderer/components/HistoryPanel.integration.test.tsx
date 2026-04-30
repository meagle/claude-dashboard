/**
 * End-to-end integration test for the History panel charts↔list flow.
 *
 * Covers the wiring landed in this iteration:
 *   1. Charts is the default view on first mount.
 *   2. View choice persists across mount/unmount via localStorage.
 *   3. Picking a FilterBar range preset reseeds the chart brush.
 *   4. Clicking a project bar in charts → flips to list view, applies
 *      the chart filter, shows the active-filter banner, and auto-expands
 *      day groups so matching rows are visible.
 *   5. Dismissing the banner clears the chart filter without touching
 *      the search query or range.
 *
 * Run with:  npx vitest run components/HistoryPanel.integration.test.tsx
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ipcRenderer } from '../utils/electron';
import { HistoryPanel } from './HistoryPanel';
import type { HistoryRow } from '../types';

/* ── Mock data ──────────────────────────────────────────────────────────
 * 12 sessions across 3 projects, 2 models, spanning the last 14 days.
 * Designed so that:
 *   • "alpha-app" dominates the project donut + leaderboard
 *   • Sonnet dominates the model donut
 *   • There is at least one day inside the last-7d window AND outside it
 *     so the preset-reseed assertion has signal in both directions.
 * ──────────────────────────────────────────────────────────────────── */

const NOW = new Date('2026-04-30T15:00:00Z').getTime();
const DAY = 86_400_000;

function row(
  i: number,
  daysAgo: number,
  dirName: string,
  model: string,
  costUsd: number,
  totalTokens: number,
): HistoryRow {
  return {
    sessionId: `s-${i}`,
    dirName,
    workingDir: `/Users/test/code/${dirName}`,
    branch: 'main',
    lastActivity: NOW - daysAgo * DAY,
    lastPrompt: `prompt ${i}`,
    currentTask: null,
    lastMessage: `message ${i}`,
    model,
    costUsd,
    totalTokens,
    turns: 4,
  } as HistoryRow;
}

const MOCK_HISTORY: HistoryRow[] = [
  row(1,   1, 'alpha-app',    'claude-sonnet-4-5', 1.20, 120_000),
  row(2,   2, 'alpha-app',    'claude-sonnet-4-5', 0.80,  90_000),
  row(3,   3, 'alpha-app',    'claude-opus-4',     2.10, 180_000),
  row(4,   4, 'alpha-app',    'claude-sonnet-4-5', 0.60,  70_000),
  row(5,   5, 'beta-tools',   'claude-sonnet-4-5', 0.45,  50_000),
  row(6,   6, 'beta-tools',   'claude-haiku-4-5',  0.10,  20_000),
  row(7,   8, 'beta-tools',   'claude-sonnet-4-5', 0.55,  60_000),
  row(8,  10, 'gamma-docs',   'claude-sonnet-4-5', 0.30,  40_000),
  row(9,  11, 'gamma-docs',   'claude-haiku-4-5',  0.05,  15_000),
  row(10, 12, 'gamma-docs',   'claude-sonnet-4-5', 0.35,  45_000),
  row(11, 13, 'alpha-app',    'claude-sonnet-4-5', 0.90, 110_000),
  row(12, 14, 'alpha-app',    'claude-opus-4',     1.80, 160_000),
];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(ipcRenderer.invoke).mockReset();
  vi.mocked(ipcRenderer.invoke).mockImplementation(async (channel: string) => {
    if (channel === 'get-history') return MOCK_HISTORY;
    return undefined;
  });
});

async function mountPanel() {
  const utils = render(<HistoryPanel showCost={true} home="/Users/test" />);
  // Wait for the async ipc.invoke('get-history') resolution + setState.
  await act(async () => { await Promise.resolve(); });
  return utils;
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe('HistoryPanel — charts↔list integration', () => {
  it('1. mounts in Charts view by default', async () => {
    await mountPanel();
    // The Charts segmented button is active (bg-edge text-brighter); the
    // chart-only "Cost by day" header is visible; the day-group headers are
    // not.
    expect(screen.getByRole('button', { name: /charts/i })).toHaveClass('text-brighter');
    expect(screen.getByText(/cost by day/i)).toBeInTheDocument();
    expect(screen.queryByText(/today/i)).not.toBeInTheDocument(); // day-group label
  });

  it('2. view choice persists across remount', async () => {
    const { unmount } = await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('button', { name: /list/i })).toHaveClass('text-brighter');
    unmount();

    await mountPanel();
    // Should restore List view, not fall back to Charts default.
    expect(screen.getByRole('button', { name: /list/i })).toHaveClass('text-brighter');
    expect(screen.queryByText(/cost by day/i)).not.toBeInTheDocument();
  });

  it('3. FilterBar range preset reseeds the chart brush', async () => {
    await mountPanel();
    // The brush shows its current window as "<from> → <to> · Nd"; capture it,
    // then pick "Last 7 days" and confirm the span shrinks.
    const initialSpan = screen.getByText(/· \d+d/).textContent;

    fireEvent.click(screen.getByRole('button', { name: /all time|last|today|this week/i }));
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /last 7 days/i }));

    const newSpan = screen.getByText(/· \d+d/).textContent;
    expect(newSpan).not.toBe(initialSpan);
    // 7d preset, clamped to the 14d data extent → expect "8d" (today + 7).
    expect(newSpan).toMatch(/· [78]d/);
  });

  it('4. clicking a project bar flips to list view + filters + banner', async () => {
    await mountPanel();
    // The leaderboard rows are buttons labelled with the project name.
    // alpha-app is the top project by cost so it appears first.
    const alphaButton = screen.getAllByRole('button', { name: /alpha-app/i })[0];
    fireEvent.click(alphaButton);

    // Now in List view.
    expect(screen.getByRole('button', { name: /list/i })).toHaveClass('text-brighter');
    // Banner is visible.
    expect(screen.getByText(/filtered → project: alpha-app/i)).toBeInTheDocument();
    // Day groups are auto-expanded — at least one HistoryEntry for alpha-app
    // should be in the DOM.
    const entries = screen.getAllByText('alpha-app');
    expect(entries.length).toBeGreaterThan(1); // banner + ≥1 row
  });

  it('5. dismissing the banner clears chart filter only', async () => {
    await mountPanel();
    // Apply a chart filter via project bar click.
    fireEvent.click(screen.getAllByRole('button', { name: /alpha-app/i })[0]);
    // Type into search before clearing — this should survive the banner clear.
    fireEvent.change(screen.getByPlaceholderText(/filter projects/i), {
      target: { value: 'prompt' },
    });

    fireEvent.click(screen.getByRole('button', { name: /clear ×/i }));

    expect(screen.queryByText(/filtered → project/i)).not.toBeInTheDocument();
    // Search query is intact.
    expect(screen.getByPlaceholderText(/filter projects/i)).toHaveValue('prompt');
  });
});
