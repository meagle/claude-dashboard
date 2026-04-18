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

const CLAUDE_ICON = (
  <svg
    className="animate-pulse shrink-0"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 509.64"
    width="16"
    height="16"
  >
    <path
      fill="#D77655"
      d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.612-115.613 115.612H115.612C52.026 509.639 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"
    />
    <path
      fill="#FCF2EE"
      fillRule="nonzero"
      d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"
    />
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

// "⌘N" session-key pill shown top-right. Derive a stable short index
// from the pid so mock data renders predictably.
function sessionKey(pid: number): string {
  // Trailing digit of the pid keeps things short (1-9). Good enough as a
  // human-recognisable session number in the UI.
  const n = (Math.abs(pid) % 9) + 1;
  return `⌘${n}`;
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
          <span className="text-fainter text-ui font-mono whitespace-nowrap">
            {timeLabel}
          </span>
        )}
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-badge border border-edge/70 bg-line/40 text-fainter text-ui font-mono leading-none"
          title="Session shortcut"
        >
          {sessionKey(s.pid)}
        </span>
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
            {isActive && !s.errorState ? CLAUDE_ICON : "🔧"}
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
    (cfg.showModel || cfg.showCost) &&
    (s.model ||
      s.contextPct != null ||
      s.costUsd != null ||
      s.totalTokens != null);

  const footer = showFooter ? (
    <div className="mt-2.5 flex items-center gap-2">
      {s.contextPct != null ? (
        <div className="flex-1 h-1 rounded-full overflow-hidden bg-line/70">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(4, s.contextPct))}%`,
              background:
                "linear-gradient(90deg, var(--color-accent) 0%, var(--color-tool) 100%)",
            }}
          />
        </div>
      ) : (
        <div className="flex-1" />
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
