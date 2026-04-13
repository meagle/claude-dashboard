import React, { useState } from 'react';
import { SessionRow, CardConfig } from '../types';
import { Badge } from './Badge';
import { ContextBar } from './ContextBar';
import { elapsedStr, agoStr, compactPath } from '../utils/format';

const COPY_ICON = (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z" />
    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5H3.5A1.5 1.5 0 0 0 2 3h12a1.5 1.5 0 0 0-1.5-1.5H11A1.5 1.5 0 0 0 9.5 0h-3z" />
  </svg>
);

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

  const isDone    = s.status === 'done';
  const isActive  = s.status === 'active';
  const isWaiting = s.status === 'waiting_permission' || s.status === 'waiting_input';

  const statusCls = isWaiting ? 'waiting' : isActive ? 'active' : isDone ? 'done' : '';
  const flashCls  = isNew ? ' newly-done' : '';

  const turnMs = s.turnStartedAt != null
    ? Date.now() - s.turnStartedAt
    : Date.now() - s.startedAt;

  const pathStr = cfg.compactPaths
    ? compactPath(s.workingDir, home)
    : (s.workingDir.startsWith(home) ? '~' + s.workingDir.slice(home.length) : s.workingDir);

  const branchLabel = cfg.showBranch
    ? [
        s.branch,
        s.worktree && s.worktree !== s.branch ? `🌿 ${s.worktree}` : s.worktree ? '🌿' : null,
      ].filter(Boolean).join(' ')
    : '';

  const gitLabel = cfg.showGitSummary && s.gitSummary ? s.gitSummary : '';
  const elapsedStr2 = !isDone ? elapsedStr(turnMs) : null;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyPath(s.workingDir);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  };

  const header = (
    <div className="card-header">
      <div className="card-header-top">
        <Badge
          status={s.status}
          lastActivity={s.lastActivity}
          errorState={s.errorState}
          loopTool={s.loopTool}
          loopCount={s.loopCount}
        />
        <span className="dirname">{s.dirName}</span>
        {isDone && (
          <button
            className="dismiss-btn"
            title="Dismiss"
            onClick={(e) => { e.stopPropagation(); onDismiss(s.sessionId); }}
          >
            ✕
          </button>
        )}
      </div>
      {(pathStr || branchLabel || gitLabel || elapsedStr2) && (
        <div className="card-header-sub">
          {pathStr && (
            <span
              className="card-path-wrap"
              title="Click to copy full path"
              onClick={handleCopyPath}
            >
              <span className="card-path" style={pathCopied ? { color: '#5acce0' } : undefined}>
                {pathCopied ? 'copied!' : pathStr}
              </span>
              <span className="copy-icon">{COPY_ICON}</span>
            </span>
          )}
          {branchLabel && <span className="branch">{branchLabel}</span>}
          {gitLabel && <span className="git-summary">git {gitLabel}</span>}
          {elapsedStr2 && <span className="elapsed">{elapsedStr2}</span>}
        </div>
      )}
    </div>
  );

  if (isDone) {
    const prompt = s.currentTask ?? s.lastPrompt;
    const answer = s.lastMessage;
    const doneFooter = cfg.showCost && s.costUsd != null
      ? <div className="card-footer"><span className="cost-badge">${s.costUsd.toFixed(4)}</span></div>
      : null;

    return (
      <div
        className={`card ${statusCls}${flashCls}`}
        data-pid={s.pid}
        data-session={s.sessionId}
        data-term={s.termSessionId ?? ''}
        onClick={() => onFocus(s.pid, s.termSessionId)}
      >
        {header}
        {prompt && <div className="card-task">📋 {prompt}</div>}
        {answer ? (
          <div className="card-qa-answer">
            ↳ {answer} <span className="done-time">• ✅ {agoStr(s.lastActivity)}</span>
          </div>
        ) : (
          <div className="card-done-row done-time">✅ Completed {agoStr(s.lastActivity)}</div>
        )}
        {doneFooter}
      </div>
    );
  }

  // ── Active / waiting / idle card ─────────────────────────────────────────
  const taskText = s.currentTask ?? s.lastPrompt;

  // Status line: current tool takes priority over partial response
  let streamRow: React.ReactNode = null;
  if (taskText) {
    if (s.currentTool) {
      streamRow = (
        <div className="card-qa-answer card-qa-tool">
          ↳ 🔧 {s.currentTool}
          {s.lastToolSummary && <span className="tool-summary"> {s.lastToolSummary}</span>}
        </div>
      );
    } else if (s.partialResponse) {
      streamRow = <div className="card-qa-answer">↳ {s.partialResponse}</div>;
    }
  }

  // Tasks row
  let tasksRow: React.ReactNode = null;
  if (s.tasks && s.tasks.length > 0) {
    const completed  = s.tasks.filter(t => t.status === 'completed').length;
    const inProgress = s.tasks.filter(t => t.status === 'in_progress').length;
    const pending    = s.tasks.filter(t => t.status === 'pending').length;
    const counts: string[] = [];
    if (completed)  counts.push(`✅ ${completed}`);
    if (inProgress) counts.push(`🔄 ${inProgress}`);
    if (pending)    counts.push(`⏳ ${pending}`);
    tasksRow = (
      <div className="card-tasks-row">
        <span className="tasks-counts">Tasks: {counts.join('  ')}</span>
        {s.contextPct != null ? <ContextBar pct={s.contextPct} /> : <span className="ctx-pct">{s.completionPct}%</span>}
      </div>
    );
  }

  // Tool row (only when no task text)
  let toolRow: React.ReactNode = null;
  const runningAgents = (s.subagents ?? []).filter(a => a.status === 'running');
  const toolParts: React.ReactNode[] = [];

  if (!taskText) {
    if (s.currentTool) {
      toolParts.push(
        <span key="tool" className="detail-tool">
          🔧 {s.currentTool}
          {s.lastToolSummary && <span className="tool-summary"> {s.lastToolSummary}</span>}
        </span>
      );
    } else if (s.lastTool) {
      const ago = s.lastToolAt ? ` • ${agoStr(s.lastToolAt)}` : '';
      toolParts.push(
        <span key="lasttool" className="detail-value">🔧 {s.lastTool}{ago}</span>
      );
    }
  }

  if (cfg.showSubagents && runningAgents.length > 0) {
    toolParts.push(
      <span key="agents" className="detail-agent">
        subagents: {runningAgents.map(a => `🤖 ${a.type} (running)`).join(', ')}
      </span>
    );
  }

  if (toolParts.length > 0) {
    toolRow = (
      <div className="card-tool-row">
        {toolParts.map((p, i) => (
          <React.Fragment key={i}>{i > 0 ? ' • ' : ''}{p}</React.Fragment>
        ))}
      </div>
    );
  }

  // Last message (idle only — not active or waiting)
  const lastMsgRow = !taskText && !toolRow && s.lastMessage && !isActive && !isWaiting
    ? <div className="card-last-msg">└ {s.lastMessage}</div>
    : null;

  // Alerts
  const alerts: React.ReactNode[] = [];
  if (isWaiting) {
    const waitMsg = s.status === 'waiting_permission' ? '⚠ Waiting for tool approval' : '⚠ Awaiting answer';
    const idleMs = Date.now() - s.lastActivity;
    const idleMins = Math.floor(idleMs / 60000);
    alerts.push(
      <div key="wait" className="card-alert">{waitMsg} • {idleMins}m idle</div>
    );
  }
  if (s.bashStartedAt && (Date.now() - s.bashStartedAt) > 30_000) {
    const elapsed = Math.floor((Date.now() - s.bashStartedAt) / 60000);
    alerts.push(
      <div key="bash" className="card-alert">⏳ Bash running {elapsed}m…</div>
    );
  }

  // Footer
  const costBadge = cfg.showCost && s.costUsd != null
    ? <span className="cost-badge">${s.costUsd.toFixed(4)}</span>
    : null;

  let footer: React.ReactNode = null;
  if (cfg.showModel) {
    if (!tasksRow && (s.model || s.contextPct != null)) {
      footer = (
        <div className="card-footer">
          {s.model && <span className="model-badge">{s.model}</span>}
          {s.contextPct != null && <ContextBar pct={s.contextPct} />}
          {costBadge}
        </div>
      );
    } else if (s.model || costBadge) {
      footer = (
        <div className="card-footer">
          {s.model && <span className="model-badge">{s.model}</span>}
          {costBadge}
        </div>
      );
    }
  } else if (costBadge) {
    footer = <div className="card-footer">{costBadge}</div>;
  }

  return (
    <div
      className={`card ${statusCls}${flashCls}`}
      data-pid={s.pid}
      data-session={s.sessionId}
      data-term={s.termSessionId ?? ''}
      onClick={() => onFocus(s.pid, s.termSessionId)}
    >
      {header}
      {taskText && <div className="card-task">📋 {taskText}</div>}
      {streamRow}
      {tasksRow}
      {toolRow}
      {lastMsgRow}
      {alerts}
      {footer}
    </div>
  );
}
