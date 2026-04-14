import React, { useEffect, useState } from 'react';
import { ipcRenderer } from '../utils/electron';
import { HistoryRow } from '../types';

function formatTurns(turns: number | null): string | null {
  if (turns == null || turns <= 0) return null;
  return turns === 1 ? '1 turn' : `${turns} turns`;
}

function formatCost(costUsd: number | null): string | null {
  if (costUsd == null) return null;
  return `$${costUsd.toFixed(2)}`;
}

function dayLabel(date: Date, today: Date): string {
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === todayStr) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

interface DayGroup {
  label: string;
  sessions: HistoryRow[];
  totalCost: number | null;
}

function groupByDay(sessions: HistoryRow[], showCost: boolean): DayGroup[] {
  const today = new Date();
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  const map = new Map<string, HistoryRow[]>();
  for (const s of sorted) {
    const date = new Date(s.startedAt);
    const key = date.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([key, rows]) => {
    const hasCost = showCost && rows.some(r => r.costUsd != null);
    const total = hasCost ? rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0) : null;
    return {
      label: dayLabel(new Date(key), today),
      sessions: rows,
      totalCost: total,
    };
  });
}

function shortModel(model: string | null): string | null {
  if (!model) return null;
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('haiku')) return 'Haiku';
  return model.split('-').slice(0, 2).join(' ');
}

interface HistoryPanelProps {
  showCost: boolean;
}

export function HistoryPanel({ showCost }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    ipcRenderer.invoke('get-history').then((rows: HistoryRow[]) => {
      setHistory(rows ?? []);
    });
  }, []);

  if (history === null) {
    return (
      <div id="history-panel" className="px-3 py-4 text-soft text-xs">Loading…</div>
    );
  }

  if (history.length === 0) {
    return (
      <div id="history-panel" className="px-3 py-4 text-soft text-xs leading-relaxed">
        No history yet — completed sessions appear here after they expire from the dashboard.
      </div>
    );
  }

  const groups = groupByDay(history, showCost);

  return (
    <div id="history-panel" className="px-2 py-1.5 overflow-y-auto flex-1 min-h-0">
      {groups.map((group) => (
        <div key={group.label} className="mb-3">
          <div className="flex items-center gap-2 px-1 pb-1 border-b border-line text-[11px] text-faint">
            <span className="font-semibold text-soft">{group.label}</span>
            <span>{group.sessions.length} session{group.sessions.length !== 1 ? 's' : ''}</span>
            {group.totalCost != null && <span>total {formatCost(group.totalCost)}</span>}
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            {group.sessions.map((s) => {
              const turns = formatTurns(s.turns);
              const cost = showCost ? formatCost(s.costUsd) : null;
              const model = shortModel(s.model);
              const prompt = s.lastPrompt
                ? s.lastPrompt.length > 60 ? s.lastPrompt.slice(0, 60) + '…' : s.lastPrompt
                : null;
              return (
                <div key={s.sessionId} className="px-1 py-0.5 rounded hover:bg-card text-[11px]">
                  <div className="flex items-center gap-2 text-soft">
                    <span className="text-faint">●</span>
                    <span className="font-medium text-bright">{s.dirName}</span>
                    {turns && <span>{turns}</span>}
                    {cost && <span>cost {cost}</span>}
                    {model && <span className="text-faint">model {model}</span>}
                  </div>
                  {prompt && (
                    <div className="pl-4 text-faint truncate mt-0.5">› {prompt}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
