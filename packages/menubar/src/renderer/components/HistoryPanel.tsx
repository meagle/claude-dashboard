import React, { useEffect, useState } from 'react';
import { ipcRenderer, clipboard } from '../utils/electron';
import { HistoryRow } from '../types';
import { compactPath, formatTokens } from '../utils/format';
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
    ? s.lastMessage.length > 160 ? s.lastMessage.slice(0, 160) + '…' : s.lastMessage
    : null;
  const pathStr = compactPath(s.workingDir, home);

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    clipboard.writeText(s.workingDir);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  };

  return (
    <div className="border border-line rounded-md px-[11px] pt-2 pb-[7px] opacity-75 hover:opacity-100 transition-opacity duration-150">
      {/* Top row: dir name + metadata */}
      <div className="flex items-baseline gap-2.5 mb-[3px] leading-[1.4]">
        <span className="font-bold text-brighter text-[13px]">{s.dirName}</span>
        {turns && <span className="text-soft text-[13px] px-2">{turns}</span>}
        {tools && <span className="text-faint text-[13px]">{tools}</span>}
        {tokens && <span className="text-faint text-[13px]">{tokens}</span>}
        {cost && <span className="text-soft text-[13px]">{cost}</span>}
        {model && <span className="text-faint text-[13px]">{model}</span>}
      </div>
      {/* Path row */}
      <div
        className="inline-flex items-center min-w-0 pr-2 mb-[5px] cursor-pointer group/path"
        title="Click to copy full path"
        onClick={handleCopyPath}
      >
        <span className={`text-sm overflow-hidden text-ellipsis whitespace-nowrap min-w-0 ${pathCopied ? 'text-accent' : 'text-path group-hover/path:text-soft'}`}>
          {pathCopied ? 'copied!' : pathStr}
        </span>
        <span className="shrink-0 text-soft px-1.5 inline-flex items-center leading-none transition-colors duration-150 group-hover/path:text-accent">
          {COPY_ICON}
        </span>
      </div>
      {/* Prompt + answer */}
      {prompt && (
        <div className="text-sm text-[#c0c0c0] mt-1 break-words">
          📋 {prompt}
        </div>
      )}
      {answer ? (
        <div className="text-sm text-soft break-words pl-[14px] mt-0.5">
          ↳ {answer}
        </div>
      ) : prompt ? (
        <div className="text-sm text-git pl-[14px] mt-0.5">✅ Completed</div>
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

  return (
    <div id="history-panel" className="flex flex-col gap-4 px-2 py-1.5 overflow-y-auto flex-1 min-h-0">
      {groups.map((group, i) => (
        <div key={group.label} className={i > 0 ? 'mt-4' : ''}>
          <div className="flex items-baseline gap-6 px-1 pb-1.5 border-b border-line mb-2">
            <span className="font-bold text-bright">{group.label}</span>
            <span className="text-soft">{group.sessions.length} session{group.sessions.length !== 1 ? 's' : ''}</span>
            {group.totalCost != null && <span className="text-soft">· total {formatCost(group.totalCost)}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            {group.sessions.map((s) => (
              <HistoryEntry key={s.sessionId} s={s} showCost={showCost} home={home} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
