import React from "react";
import { SessionRow, CardConfig } from "../types";
import {
  compressBranch,
  agoStr,
  elapsedStr,
  formatTokens,
} from "../utils/format";

/* ─────────────────────────────────────────────────────────────────────────
 * OneLineSessionRow — ultra-dense single-line row.
 *
 *   ▌ ● dirName  ⎇ branch ●N ↑N  ⇡ worktree   prompt preview…   ──▬── 34%  820k  ⌘1  8m
 *   ^
 *   └─ 2px accent stripe (status-coloured, same palette as SessionCard)
 *
 * Shares the visual language of SessionCard / CompactSessionRow:
 *   · left accent stripe coloured by status
 *   · pulsing status dot
 *   · branch pill with diff-dot + ahead arrow
 *   · violet worktree pill
 *   · cyan→violet context gradient bar
 *   · ⌘N session-key pill, tabular-num elapsed
 *
 * Trailing cluster uses fixed widths so context bars & token columns line
 * up vertically across rows.
 * ────────────────────────────────────────────────────────────────────── */

const BRANCH_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

const WORKTREE_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </svg>
);

// ── Status → colors (mirror SessionCard / CompactSessionRow) ──────────────

function accentColor(
  status: SessionRow["status"],
  errorState: boolean,
): string {
  if (errorState) return "bg-badge-loop";
  if (status === "waiting_permission" || status === "waiting_input")
    return "bg-badge-waiting";
  if (status === "active") return "bg-branch";
  if (status === "done") return "bg-badge-done";
  return "bg-accent";
}

function dotColor(status: SessionRow["status"], errorState: boolean): string {
  if (errorState) return "text-badge-loop";
  if (status === "waiting_permission" || status === "waiting_input")
    return "text-badge-waiting";
  if (status === "active") return "text-badge-active";
  if (status === "done") return "text-badge-done";
  return "text-accent";
}

function StatusDot({
  status,
  errorState,
}: {
  status: SessionRow["status"];
  errorState: boolean;
}) {
  const pulse =
    status === "active" ||
    status === "waiting_permission" ||
    status === "waiting_input";
  const isIdle = status === "idle";
  return (
    <span
      className={`shrink-0 inline-flex items-center ${dotColor(status, errorState)} ${
        pulse ? "animate-status-pulse" : ""
      }`}
    >
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden>
        {isIdle ? (
          <circle
            cx="5"
            cy="5"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ) : (
          <circle cx="5" cy="5" r="4.5" fill="currentColor" />
        )}
      </svg>
    </span>
  );
}

function BranchPill({
  branch,
  gitSummary,
  gitAhead,
}: {
  branch: string;
  gitSummary?: string | null;
  gitAhead?: number | null;
}) {
  let changes: number | null = null;
  if (gitSummary) {
    const m = gitSummary.match(/(\d+)\s*file/i);
    if (m) changes = parseInt(m[1], 10);
  }
  return (
    <span className="inline-flex items-center gap-1 px-1 py-[1px] rounded-badge bg-line/60 border border-edge/60 text-[11px] text-bright whitespace-nowrap leading-none">
      <span className="text-path inline-flex items-center">{BRANCH_ICON}</span>
      <span className="font-mono">{compressBranch(branch, 20)}</span>
      {changes != null && (
        <span className="inline-flex items-center gap-0.5 text-badge-waiting">
          <span className="text-[7px]">●</span>
          <span className="font-mono">{changes}</span>
        </span>
      )}
      {gitAhead != null && gitAhead > 0 && (
        <span className="inline-flex items-center text-branch font-mono">
          ↑{gitAhead}
        </span>
      )}
    </span>
  );
}

function WorktreePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1 py-[1px] rounded-badge bg-tool/15 border border-tool/40 text-[11px] text-tool whitespace-nowrap leading-none font-mono">
      <span className="inline-flex items-center">{WORKTREE_ICON}</span>
      <span>{compressBranch(label, 14)}</span>
    </span>
  );
}

function sessionKey(pid: number): string {
  const n = (Math.abs(pid) % 9) + 1;
  return `⌘${n}`;
}

interface OneLineSessionRowProps {
  session: SessionRow;
  cardConfig: CardConfig;
  home: string;
  onFocus: (pid: number, termSessionId: string | null) => void;
}

export function OneLineSessionRow({
  session: s,
  cardConfig: cfg,
  onFocus,
}: OneLineSessionRowProps) {
  const isDone = s.status === "done";
  const isActive = s.status === "active";

  const taskText = isDone
    ? (s.lastMessage ?? s.lastPrompt ?? "")
    : (s.currentTask ??
      (isActive && !s.currentTool ? s.partialResponse : null) ??
      s.lastPrompt ??
      "");

  const worktreeLabel =
    s.worktree && s.worktree !== s.branch ? s.worktree : null;

  const turnMs =
    s.turnStartedAt != null
      ? Date.now() - s.turnStartedAt
      : Date.now() - s.startedAt;
  const timeLabel = isDone ? agoStr(s.lastActivity) : elapsedStr(turnMs);

  const hasCtx = s.contextPct != null;

  return (
    <div
      className="group relative flex items-center gap-2 pl-3 pr-2 py-1 border-b border-line/60 cursor-pointer bg-surface/40 hover:bg-surface transition-colors duration-150 overflow-hidden"
      onClick={() => onFocus(s.pid, s.termSessionId)}
      data-session={s.sessionId}
      data-pid={s.pid}
    >
      {/* Left accent stripe */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-[2px] ${accentColor(s.status, s.errorState)} ${
          isActive ? "animate-status-pulse" : ""
        }`}
        aria-hidden="true"
      />

      <StatusDot status={s.status} errorState={s.errorState} />

      {/* Project + branch cluster */}
      <span className="flex items-center gap-1.5 min-w-0 shrink-0 max-w-[44%]">
        <span
          className="font-bold text-brighter text-ui truncate"
          title={s.workingDir}
        >
          {s.dirName}
        </span>
        {cfg.showBranch && s.branch && (
          <BranchPill
            branch={s.branch}
            gitSummary={cfg.showGitSummary ? s.gitSummary : null}
            gitAhead={cfg.showGitSummary ? s.gitAhead : null}
          />
        )}
        {worktreeLabel && <WorktreePill label={worktreeLabel} />}
      </span>

      {taskText && <span className="text-fainter/50 text-xs shrink-0">·</span>}

      {/* Task preview */}
      <span className="flex-1 min-w-0 text-ui text-soft truncate leading-card">
        {taskText || <span className="text-fainter italic">idle</span>}
      </span>

      {/* Loop chip */}
      {s.errorState && s.loopCount > 1 && (
        <span className="shrink-0 text-[11px] text-badge-loop font-bold font-mono px-1.5 py-[1px] rounded-badge bg-badge-loop/15 border border-badge-loop/40">
          ×{s.loopCount} loop
        </span>
      )}

      {/* Fixed-width trailing cluster → context bars line up across rows */}
      <span className="shrink-0 flex items-center gap-2 w-[210px] justify-end">
        {/* Context bar slot (always same width) */}
        <span className="flex items-center gap-1.5 w-[86px] shrink-0">
          {hasCtx ? (
            <>
              <span className="w-14 h-1 rounded-full overflow-hidden bg-line/70">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(4, s.contextPct!))}%`,
                    background:
                      "linear-gradient(90deg, var(--color-accent) 0%, var(--color-tool) 100%)",
                  }}
                />
              </span>
              <span className="text-fainter text-[11px] font-mono tabular-nums w-6 text-right">
                {s.contextPct}%
              </span>
            </>
          ) : (
            <span aria-hidden />
          )}
        </span>

        {/* Tokens — fixed width */}
        <span className="text-fainter text-[11px] font-mono tabular-nums w-[52px] text-right whitespace-nowrap">
          {cfg.showCost && s.totalTokens != null
            ? formatTokens(s.totalTokens)
            : ""}
        </span>

        {/* ⌘-key shortcut */}
        <span className="inline-flex items-center px-1.5 py-[1px] rounded-badge border border-edge/60 bg-line/40 text-fainter text-[11px] font-mono leading-none">
          {sessionKey(s.pid)}
        </span>

        {/* Elapsed */}
        <span className="text-fainter text-[11px] font-mono tabular-nums w-10 text-right whitespace-nowrap">
          {timeLabel}
        </span>
      </span>
    </div>
  );
}
