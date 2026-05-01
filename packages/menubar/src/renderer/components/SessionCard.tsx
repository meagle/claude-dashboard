import React, { useState, useEffect } from "react";
import { SessionRow, CardConfig } from "../types";
import { Badge } from "./Badge";
import { ContextBar } from "./ContextBar";
import {
  elapsedStr,
  agoStr,
  compressBranch,
  formatTokens,
} from "../utils/format";
import { COPY_ICON } from "./icons";

// ── Inline icons ──────────────────────────────────────────────────────────
const BRANCH_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

const FOLDER_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

const WORKTREE_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="11"
    height="11"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </svg>
);


// ── Small helpers ─────────────────────────────────────────────────────────

// Accent-bar color class per status. Uses existing semantic tokens.
function accentColor(
  status: SessionRow["status"],
  errorState: boolean,
): string {
  if (errorState) return "bg-badge-loop"; // red
  if (status === "waiting_permission" || status === "waiting_input")
    return "bg-badge-waiting"; // amber
  if (status === "active") return "bg-branch"; // green
  if (status === "done") return "bg-badge-done"; // neutral
  return "bg-accent"; // idle → cyan/blue
}

// Status dot color — same palette as the accent bar.
function dotColor(status: SessionRow["status"], errorState: boolean): string {
  if (errorState) return "text-badge-loop";
  if (status === "waiting_permission" || status === "waiting_input")
    return "text-badge-waiting";
  if (status === "active") return "text-badge-active";
  if (status === "done") return "text-badge-done";
  return "text-accent";
}

// Git-change indicators inside the branch pill: ● N (diff dot) + ↑ N (ahead)
function BranchPill({
  branch,
  gitSummary,
  gitAhead,
}: {
  branch: string;
  gitSummary?: string | null;
  gitAhead?: number | null;
}) {
  // Extract a single "changed files" count from gitSummary if present,
  // e.g. "3 files +42 -7" → 3. Fallback: show nothing for the diff dot.
  let changes: number | null = null;
  if (gitSummary) {
    const m = gitSummary.match(/(\d+)\s*file/i);
    if (m) changes = parseInt(m[1], 10);
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-badge bg-line/60 border border-edge/60 text-sm text-bright whitespace-nowrap leading-none">
      <span className="text-path inline-flex items-center">{BRANCH_ICON}</span>
      <span className="font-mono">{compressBranch(branch, 28)}</span>
      {changes != null && (
        <span className="inline-flex items-center gap-0.5 text-badge-waiting">
          <span className="text-[8px]">●</span>
          <span className="font-mono">{changes}</span>
        </span>
      )}
      {gitAhead != null && gitAhead > 0 && (
        <span className="inline-flex items-center gap-0.5 text-branch font-mono">
          ↑{gitAhead}
        </span>
      )}
    </span>
  );
}

function WorktreePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-badge bg-tool/15 border border-tool/40 text-sm text-tool whitespace-nowrap leading-none">
      <span className="inline-flex items-center">{WORKTREE_ICON}</span>
      <span className="font-mono">{label}</span>
    </span>
  );
}

// Token-count pill shown on the right of the footer bar.
function TokenChip({ label }: { label: string }) {
  return (
    <span className="text-fainter text-ui font-mono whitespace-nowrap shrink-0">
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: SessionRow;
  cardConfig: CardConfig;
  home: string;
  isNew: boolean;
  onFocus: (pid: number, termSessionId: string | null) => void;
  onDismiss: (sessionId: string) => void;
  onCopyPath: (workingDir: string) => void;
}

export function SessionCard({
  session: s,
  cardConfig: cfg,
  home,
  isNew,
  onFocus,
  onDismiss,
  onCopyPath,
}: SessionCardProps) {
  const [pathCopied, setPathCopied] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const isDone = s.status === "done";
  const isActive = s.status === "active";
  const isWaiting =
    s.status === "waiting_permission" || s.status === "waiting_input";

  // One-shot flash when a card first arrives / transitions to done.
  useEffect(() => {
    if (!isNew) return;
    setIsFlashing(true);
    const id = setTimeout(() => setIsFlashing(false), 2100);
    return () => clearTimeout(id);
  }, [isNew]);

  const turnMs =
    s.turnStartedAt != null
      ? Date.now() - s.turnStartedAt
      : Date.now() - s.startedAt;

  const worktreeLabel =
    s.worktree && s.worktree !== s.branch ? s.worktree : null;

  const timeLabel = isDone ? agoStr(s.lastActivity) : elapsedStr(turnMs);

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyPath(s.workingDir);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  };

  // Card chrome — rounded, subtle border, relative so the accent bar can
  // be absolutely positioned on the left edge.
  const cardCls = [
    "group relative overflow-hidden",
    "rounded-lg border border-line/80",
    "bg-surface/70 backdrop-blur-sm",
    "pl-4 pr-3 py-3",
    "cursor-pointer transition-all duration-150",
    "hover:bg-surface hover:border-edge",
    isFlashing ? "animate-flash" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const accentCls = [
    "absolute left-0 top-0 bottom-0 w-1",
    accentColor(s.status, s.errorState),
    isActive ? "animate-status-pulse" : "",
  ].join(" ");

  // Primary prompt / task text for this session.
  const taskText =
    (isDone
      ? (s.currentTask ?? s.lastPrompt)
      : (s.currentTask ?? s.lastPrompt)) ?? null;
  const answer = isDone ? s.lastMessage : null;

  // ── Top row: dot + title + ⌘-key pill + dismiss ────────────────────────
  const topRow = (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`shrink-0 ${dotColor(s.status, s.errorState)}`}>
        <Badge status={s.status} lastActivity={s.lastActivity} size="sm" />
      </span>
      <span className="font-bold text-brighter text-[15px] truncate min-w-0 flex-1">
        {taskText || s.dirName}
      </span>
      <span className="shrink-0 inline-flex items-center gap-1.5">
        {timeLabel && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-badge border border-edge/70 bg-line/40 text-fainter text-ui font-mono tabular-nums leading-none whitespace-nowrap">
            {timeLabel}
          </span>
        )}
        <button
          className={[
            "bg-transparent border-none cursor-pointer leading-none",
            "text-fainter hover:text-danger transition-opacity duration-150",
            "text-ui px-0.5",
            isDone ? "opacity-0 group-hover:opacity-100" : "invisible",
          ].join(" ")}
          title="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            if (isDone) onDismiss(s.sessionId);
          }}
        >
          ✕
        </button>
      </span>
    </div>
  );

  // ── Meta row: repo · branch-pill · worktree-pill ───────────────────────
  const metaRow = (
    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-sm leading-none">
      <span className="inline-flex items-center gap-1 text-fainter min-w-0">
        <span className="inline-flex items-center text-path">
          {FOLDER_ICON}
        </span>
        <span className="font-mono truncate max-w-[160px]" title={s.workingDir}>
          {s.dirName}
        </span>
        <span
          className="ml-0.5 inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-soft hover:text-accent"
          title={`Copy: ${s.workingDir}`}
          onClick={handleCopyPath}
        >
          {pathCopied ? (
            <span className="text-accent text-xs leading-none">✓</span>
          ) : (
            COPY_ICON
          )}
        </span>
      </span>
      {cfg.showBranch && s.branch && (
        <>
          <span className="text-fainter/60">·</span>
          <BranchPill
            branch={s.branch}
            gitSummary={cfg.showGitSummary ? s.gitSummary : null}
            gitAhead={cfg.showGitSummary ? s.gitAhead : null}
          />
        </>
      )}
      {worktreeLabel && <WorktreePill label={worktreeLabel} />}
      {s.toolCount > 0 && (
        <>
          <span className="text-fainter/60">·</span>
          <span className="text-fainter text-sm font-mono whitespace-nowrap">
            {s.toolCount} tools
          </span>
        </>
      )}
      {s.turns != null && s.turns > 0 && (
        <>
          <span className="text-fainter/60">·</span>
          <span className="text-fainter text-sm font-mono whitespace-nowrap">
            {s.turns} turns
          </span>
        </>
      )}
    </div>
  );

  // ── Body panel: quoted prompt preview ──────────────────────────────────
  const promptPreview = taskText ? (
    <div className="mt-2.5 rounded-md bg-base/60 border border-line/60 px-2.5 py-2">
      <div className="flex items-start gap-1.5 text-sm text-prompt leading-card break-words">
        <span className="shrink-0 text-fainter leading-none text-base font-bold mt-px">
          ›
        </span>
        <span className="min-w-0">{taskText}</span>
      </div>
      {answer && (
        <div className="mt-1 pl-4 text-sm text-soft break-words leading-card">
          <span className="text-fainter mr-1">↳</span>
          {answer}
        </div>
      )}
    </div>
  ) : null;

  // ── Active stream / tool row (only for non-done cards) ─────────────────
  let streamRow: React.ReactNode = null;
  if (!isDone && taskText) {
    const toolName = s.currentTool ?? (s.errorState ? s.loopTool : null);
    if (toolName) {
      streamRow = (
        <div
          className={`mt-1.5 text-sm flex items-start gap-1.5 break-words ${
            s.errorState ? "text-badge-loop" : "text-tool"
          }`}
        >
          <span className="shrink-0">
            🔧
          </span>
          <span className="min-w-0">
            <span className="font-mono">{toolName}</span>
            {s.errorState && s.loopCount > 1 && (
              <span className="font-bold"> ×{s.loopCount} loop</span>
            )}
            {s.lastToolSummary && (
              <span className={s.errorState ? "opacity-70" : "text-faint"}>
                {" "}
                {s.lastToolSummary}
              </span>
            )}
          </span>
        </div>
      );
    } else if (s.partialResponse) {
      streamRow = (
        <div className="mt-1.5 text-sm text-soft break-words flex items-start gap-1.5">
          <span className="text-fainter">↳</span>
          <span className="min-w-0">{s.partialResponse}</span>
        </div>
      );
    }
  }

  // ── Tasks summary (agent checklist) ────────────────────────────────────
  let tasksRow: React.ReactNode = null;
  if (s.tasks && s.tasks.length > 0) {
    const completed = s.tasks.filter((t) => t.status === "completed").length;
    const inProgress = s.tasks.filter((t) => t.status === "in_progress").length;
    const pending = s.tasks.filter((t) => t.status === "pending").length;
    const counts: string[] = [];
    if (completed) counts.push(`✅ ${completed}`);
    if (inProgress) counts.push(`🔄 ${inProgress}`);
    if (pending) counts.push(`⏳ ${pending}`);
    tasksRow = (
      <div className="flex items-center justify-between mt-2 text-sm text-soft">
        <span className="shrink-0">Tasks: {counts.join("  ")}</span>
        {s.contextPct != null ? (
          <ContextBar pct={s.contextPct} />
        ) : (
          <span className="text-faint">{s.completionPct}%</span>
        )}
      </div>
    );
  }

  // ── Idle / done state-only tool & message lines ────────────────────────
  let idleToolRow: React.ReactNode = null;
  if (!taskText && !isDone) {
    if (s.currentTool) {
      idleToolRow = (
        <div className="mt-1.5 text-sm text-tool whitespace-nowrap overflow-hidden text-ellipsis">
          🔧 <span className="font-mono">{s.currentTool}</span>
          {s.lastToolSummary && (
            <span className="text-faint"> {s.lastToolSummary}</span>
          )}
        </div>
      );
    } else if (s.lastTool) {
      const ago = s.lastToolAt ? ` · ${agoStr(s.lastToolAt)}` : "";
      idleToolRow = (
        <div className="mt-1.5 text-sm text-fainter whitespace-nowrap overflow-hidden text-ellipsis">
          🔧 <span className="font-mono">{s.lastTool}</span>
          {ago}
        </div>
      );
    } else if (s.lastMessage) {
      idleToolRow = (
        <div className="mt-1.5 text-sm text-soft break-words">
          <span className="text-fainter mr-1">└</span>
          {s.lastMessage}
        </div>
      );
    }
  }

  // ── Alerts (waiting / long bash) ───────────────────────────────────────
  const alerts: React.ReactNode[] = [];
  if (isWaiting) {
    const waitMsg =
      s.status === "waiting_permission"
        ? "⚠ Waiting for tool approval"
        : "⚠ Awaiting answer";
    const idleMins = Math.floor((Date.now() - s.lastActivity) / 60000);
    alerts.push(
      <div key="wait" className="mt-2 text-alert text-sm">
        {waitMsg} · {idleMins}m idle
      </div>,
    );
  }
  if (s.bashStartedAt && Date.now() - s.bashStartedAt > 30_000) {
    const elapsed = Math.floor((Date.now() - s.bashStartedAt) / 60000);
    alerts.push(
      <div key="bash" className="mt-2 text-alert text-sm">
        ⏳ Bash running {elapsed}m…
      </div>,
    );
  }

  // ── Footer: gradient token bar ─────────────────────────────────────────
  const showFooter =
    !!s.appName ||
    ((cfg.showModel || cfg.showCost) &&
      (s.model ||
        s.contextPct != null ||
        s.costUsd != null ||
        s.totalTokens != null));

  const footer = showFooter ? (
    <div className="mt-2.5 flex items-center justify-between gap-2">
      {s.contextPct != null && (
        <div className="flex items-center gap-1.5">
          <div className="w-36 h-1 rounded-full overflow-hidden bg-line/70">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(4, s.contextPct))}%`,
                background:
                  "linear-gradient(90deg, var(--color-accent) 0%, var(--color-tool) 100%)",
              }}
            />
          </div>
          <span className="text-fainter text-[11px] font-mono tabular-nums shrink-0">
            {s.contextPct}%
          </span>
        </div>
      )}
      {s.appName && (
        <span className="text-faint text-ui shrink-0">{s.appName}</span>
      )}
      {cfg.showModel && s.model && (
        <span className="bg-model-bg text-accent text-ui font-bold px-1.5 py-px rounded-badge shrink-0 font-mono">
          {s.model}
        </span>
      )}
      {cfg.showCost && s.costUsd != null && (
        <TokenChip label={`$${s.costUsd.toFixed(4)}`} />
      )}
      {cfg.showCost && s.totalTokens != null && (
        <TokenChip label={formatTokens(s.totalTokens) ?? ""} />
      )}
    </div>
  ) : null;

  return (
    <div
      className={cardCls}
      data-pid={s.pid}
      data-session={s.sessionId}
      data-term={s.termSessionId ?? ""}
      onClick={() => onFocus(s.pid, s.termSessionId)}
    >
      <span className={accentCls} aria-hidden="true" />
      {topRow}
      {metaRow}
      {promptPreview}
      {streamRow}
      {tasksRow}
      {idleToolRow}
      {alerts}
      {footer}
    </div>
  );
}
