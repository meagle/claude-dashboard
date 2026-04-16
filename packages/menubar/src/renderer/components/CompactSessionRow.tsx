import React from 'react';
import { SessionRow, CardConfig } from '../types';
import { Badge } from './Badge';
import { compressBranch, agoStr, elapsedStr } from '../utils/format';

const BRANCH_ICON = (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

function ctxDotColor(pct: number): string {
  if (pct >= 80) return 'text-ctx-crit';
  if (pct >= 60) return 'text-ctx-warn';
  return 'text-ctx-fill';
}

interface CompactSessionRowProps {
  session: SessionRow;
  cardConfig: CardConfig;
  home: string;
  onFocus: (pid: number, termSessionId: string | null) => void;
}

export function CompactSessionRow({ session: s, cardConfig: cfg, onFocus }: CompactSessionRowProps) {
  const isDone = s.status === 'done';
  const taskText = s.currentTask ?? s.lastPrompt ?? '';
  const branchRaw = cfg.showBranch
    ? [
        s.branch,
        s.worktree && s.worktree !== s.branch ? `🌿 ${s.worktree}` : s.worktree ? '🌿' : null,
      ].filter(Boolean).join(' ')
    : '';
  const branchLabel = branchRaw ? compressBranch(branchRaw) : null;

  const turnMs = s.turnStartedAt != null
    ? Date.now() - s.turnStartedAt
    : Date.now() - s.startedAt;
  const timeLabel = isDone ? agoStr(s.lastActivity) : elapsedStr(turnMs);

  return (
    <div
      className="grid items-center gap-2 px-3 py-1.5 border-b border-line cursor-pointer bg-surface hover:brightness-110 transition-colors duration-150 overflow-hidden"
      style={{ gridTemplateColumns: '20px 130px 1fr 65px 80px' }}
      onClick={() => onFocus(s.pid, s.termSessionId)}
    >
      {/* STATUS DOT (no label) */}
      <span className="flex items-center justify-center">
        <Badge status={s.status} lastActivity={s.lastActivity} size="sm" />
      </span>

      {/* PROJECT */}
      <span className="flex flex-col min-w-0 overflow-hidden">
        <span className="font-bold text-brighter text-ui overflow-hidden text-ellipsis whitespace-nowrap">{s.dirName}</span>
        {branchLabel && (
          <span className="flex items-center gap-0.5 text-branch text-[11px] whitespace-nowrap overflow-hidden">
            <span className="text-path inline-flex items-center shrink-0">{BRANCH_ICON}</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{branchLabel}</span>
          </span>
        )}
      </span>

      {/* TASK */}
      <span className="text-ui text-soft overflow-hidden text-ellipsis whitespace-nowrap">{taskText}</span>

      {/* CONTEXT % */}
      <span className="flex items-center gap-1 min-w-0">
        {s.contextPct != null && (
          <>
            <svg viewBox="0 0 10 10" width="8" height="8" xmlns="http://www.w3.org/2000/svg"
              className={`shrink-0 ${ctxDotColor(s.contextPct)}`}>
              <circle cx="5" cy="5" r="4.5" fill="currentColor" />
            </svg>
            <span className="text-faint text-ui whitespace-nowrap">{s.contextPct}%</span>
          </>
        )}
      </span>

      {/* TIME */}
      <span className="text-fainter text-ui whitespace-nowrap overflow-hidden text-ellipsis">{timeLabel}</span>
    </div>
  );
}
