import React, { useEffect, useState } from 'react';
import { ipcRenderer, clipboard } from '../utils/electron';
import { HistoryRow } from '../types';
import { formatTokens } from '../utils/format';
import { COPY_ICON } from './icons';

function formatTurns(turns: number | null): string | null {
  if (turns == null || turns <= 0) return null;
  return turns === 1 ? '1 turn' : `${turns} turns`;
}

function formatCost(costUsd: number | null): string | null {
  if (costUsd == null) return null;
  return `$${costUsd.toFixed(2)}`;
}

function formatTools(toolCount: number): string | null {
  return toolCount > 0 ? `${toolCount} tools` : null;
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
  const sorted = [...sessions].sort((a, b) => b.lastActivity - a.lastActivity);
  const map = new Map<string, HistoryRow[]>();
  for (const s of sorted) {
    const date = new Date(s.lastActivity);
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

interface HistoryEntryProps {
  s: HistoryRow;
  showCost: boolean;
  home: string;
}

function HistoryEntry({ s, showCost, home }: HistoryEntryProps) {
  const [pathCopied, setPathCopied] = useState(false);

  const turns = formatTurns(s.turns);
  const tools = formatTools(s.toolCount);
  const cost = showCost ? formatCost(s.costUsd) : null;
  const tokens = showCost ? formatTokens(s.totalTokens) : null;
  const model = shortModel(s.model);
  const prompt = s.currentTask ?? s.lastPrompt;
  const answer = s.lastMessage
    ? s.lastMessage.length > 200 ? s.lastMessage.slice(0, 200) + '…' : s.lastMessage
    : null;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    clipboard.writeText(s.workingDir);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  };

  return (
    <div className="border border-line rounded-md px-3 pt-2 pb-2 opacity-75 hover:opacity-100 transition-opacity duration-150">
      {/* Dir name + copy icon */}
      <div className="flex items-center gap-1.5 mb-1.5 leading-card">
        <span
          className="font-bold text-brighter text-[15px] truncate cursor-pointer group/path flex items-center gap-1 min-w-0"
          title={pathCopied ? 'Copied!' : `Copy: ${s.workingDir}`}
          onClick={handleCopyPath}
        >
          <span className="truncate text-white">{s.dirName}</span>
          <span className={`shrink-0 inline-flex items-center transition-colors duration-150 ${pathCopied ? 'text-accent' : 'text-faint group-hover/path:text-accent'}`}>
            {pathCopied ? <span className="text-[11px]">✓</span> : COPY_ICON}
          </span>
        </span>
        <span className="flex items-center gap-2 ml-auto shrink-0 text-faint text-ui">
          {turns && <span className="text-soft">{turns}</span>}
          {tools && <span>{tools}</span>}
          {tokens && <span>{tokens}</span>}
          {cost && <span className="text-soft">{cost}</span>}
          {model && <span>{model}</span>}
        </span>
      </div>
      {/* Prompt + answer styled like SessionCard */}
      {prompt && (
        <div className="text-sm font-bold text-prompt break-words flex items-start gap-1.5 pl-1 mb-1">
          <span className="shrink-0 mt-px text-brighter leading-none text-lg font-bold">›</span>
          <span>{prompt}</span>
        </div>
      )}
      {answer ? (
        <div className="text-sm text-soft break-words pl-5 mt-0.5">
          ↳ {answer}
        </div>
      ) : prompt ? (
        <div className="text-sm text-git pl-5 mt-0.5">✅ Completed</div>
      ) : null}
    </div>
  );
}

interface HistoryPanelProps {
  showCost: boolean;
  home: string;
}

export function HistoryPanel({ showCost, home }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    requestAnimationFrame(() => ipcRenderer.send('resize-to-fit'));
  }, [expanded]);

  useEffect(() => {
    ipcRenderer.invoke('get-history').then((rows: HistoryRow[]) => {
      setHistory(rows ?? []);
    });
  }, []);

  if (history === null) {
    return (
      <div id="history-panel" className="px-3 py-4 text-soft text-sm">Loading…</div>
    );
  }

  if (history.length === 0) {
    return (
      <div id="history-panel" className="px-3 py-4 text-soft text-sm leading-relaxed">
        No history yet — completed sessions appear here after they expire from the dashboard.
      </div>
    );
  }

  const groups = groupByDay(history, showCost);

  const toggle = (label: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  return (
    <div id="history-panel" className="flex flex-col px-2 py-1.5 overflow-y-auto flex-1 min-h-0">
      {groups.map((group) => {
        const open = expanded.has(group.label);
        return (
          <div key={group.label}>
            <button
              className="w-full grid items-center px-1 py-2 border-b border-line hover:bg-surface transition-colors duration-150 cursor-pointer"
              style={{ gridTemplateColumns: '16px 1fr 100px 60px 8px', gap: '0 16px' }}
              onClick={() => toggle(group.label)}
            >
              <span className={`text-faint text-[10px] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>▶</span>
              <span className="font-bold text-bright text-left">{group.label}</span>
              <span className="text-soft text-ui text-right">{group.sessions.length} session{group.sessions.length !== 1 ? 's' : ''}</span>
              <span className="text-faint text-ui text-right">{group.totalCost != null ? formatCost(group.totalCost) : ''}</span>
              <span />
            </button>
            {open && (
              <div className="flex flex-col gap-1.5 pt-1.5 pb-2">
                {group.sessions.map((s) => (
                  <HistoryEntry key={s.sessionId} s={s} showCost={showCost} home={home} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
