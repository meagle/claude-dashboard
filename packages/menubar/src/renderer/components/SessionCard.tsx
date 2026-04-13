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

  const gitLabel   = cfg.showGitSummary && s.gitSummary ? s.gitSummary : '';
  const elapsedStr2 = !isDone ? elapsedStr(turnMs) : null;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyPath(s.workingDir);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  };

  // Card border + state classes
  const cardBorder = isNew
    ? 'border-[#3a8a3a] animate-flash'
    : isWaiting
    ? 'border-waiting-border'
    : isActive
    ? 'border-active-border'
    : isDone
    ? 'border-line opacity-50'
    : 'border-edge';

  const cardCls = `border rounded-md px-[11px] pt-2 pb-[7px] cursor-pointer transition-colors duration-100 hover:bg-surface ${cardBorder}`;

  const header = (
    <div className="flex flex-col gap-0.5 mb-[5px] leading-[1.4]">
      {/* Top row: badge + dirname + dismiss */}
      <div className="flex items-baseline gap-2 overflow-hidden">
        <Badge
          status={s.status}
          lastActivity={s.lastActivity}
          errorState={s.errorState}
          loopTool={s.loopTool}
          loopCount={s.loopCount}
        />
        <span className="font-bold text-brighter shrink min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {s.dirName}
        </span>
        {isDone && (
          <button
            className="shrink-0 ml-auto bg-transparent border-none cursor-pointer text-faint text-[13px] leading-none px-0.5 pl-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:text-[#e06060]"
            title="Dismiss"
            onClick={(e) => { e.stopPropagation(); onDismiss(s.sessionId); }}
          >
            ✕
          </button>
        )}
      </div>
      {/* Sub row: path, branch, git, elapsed */}
      {(pathStr || branchLabel || gitLabel || elapsedStr2) && (
        <div className="flex items-baseline gap-2.5 flex-wrap" style={{ rowGap: '2px' }}>
          {pathStr && (
            <span
              className="inline-flex items-center min-w-0 shrink cursor-pointer group/path"
              title="Click to copy full path"
              onClick={handleCopyPath}
            >
              <span className={`text-sm overflow-hidden text-ellipsis whitespace-nowrap min-w-0 ${pathCopied ? 'text-accent' : 'text-path group-hover/path:text-soft'}`}>
                {pathCopied ? 'copied!' : pathStr}
              </span>
              <span className="shrink-0 text-soft px-1.5 inline-flex items-center leading-none transition-colors duration-150 group-hover/path:text-accent">
                {COPY_ICON}
              </span>
            </span>
          )}
          {branchLabel && <span className="text-branch text-sm whitespace-nowrap">{branchLabel}</span>}
          {gitLabel    && <span className="text-git text-sm whitespace-nowrap">git {gitLabel}</span>}
          {elapsedStr2 && <span className="text-fainter text-sm whitespace-nowrap">{elapsedStr2}</span>}
        </div>
      )}
    </div>
  );

  if (isDone) {
    const prompt = s.currentTask ?? s.lastPrompt;
    const answer = s.lastMessage;
    const doneFooter = cfg.showCost && s.costUsd != null
      ? <div className="flex items-center gap-2 mt-4"><span className="text-soft text-[13px] shrink-0">${s.costUsd.toFixed(4)}</span></div>
      : null;

    return (
      <div
        className={`group ${cardCls}`}
        data-pid={s.pid}
        data-session={s.sessionId}
        data-term={s.termSessionId ?? ''}
        onClick={() => onFocus(s.pid, s.termSessionId)}
      >
        {header}
        {prompt && <div className="text-sm text-[#c0c0c0] mt-[14px] mb-1.5 break-words">📋 {prompt}</div>}
        {answer ? (
          <div className="text-sm text-soft break-words pl-[14px] mt-0.5 mb-1">
            ↳ {answer} <span className="text-git">• ✅ {agoStr(s.lastActivity)}</span>
          </div>
        ) : (
          <div className="text-sm text-git whitespace-nowrap overflow-hidden text-ellipsis">✅ Completed {agoStr(s.lastActivity)}</div>
        )}
        {doneFooter}
      </div>
    );
  }

  // ── Active / waiting / idle card ──────────────────────────────────────────
  const taskText = s.currentTask ?? s.lastPrompt;

  let streamRow: React.ReactNode = null;
  if (taskText) {
    if (s.currentTool) {
      streamRow = (
        <div className="text-sm text-tool break-words pl-[14px] mt-0.5 mb-1">
          ↳ 🔧 {s.currentTool}
          {s.lastToolSummary && <span className="text-faint"> {s.lastToolSummary}</span>}
        </div>
      );
    } else if (s.partialResponse) {
      streamRow = <div className="text-sm text-soft break-words pl-[14px] mt-0.5 mb-1">↳ {s.partialResponse}</div>;
    }
  }

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
      <div className="flex items-center justify-between mb-1 text-sm text-soft">
        <span className="shrink-0">Tasks: {counts.join('  ')}</span>
        {s.contextPct != null ? <ContextBar pct={s.contextPct} /> : <span className="text-faint">{s.completionPct}%</span>}
      </div>
    );
  }

  let toolRow: React.ReactNode = null;
  const runningAgents = (s.subagents ?? []).filter(a => a.status === 'running');
  const toolParts: React.ReactNode[] = [];

  if (!taskText) {
    if (s.currentTool) {
      toolParts.push(
        <span key="tool" className="text-tool">
          🔧 {s.currentTool}
          {s.lastToolSummary && <span className="text-faint"> {s.lastToolSummary}</span>}
        </span>
      );
    } else if (s.lastTool) {
      const ago = s.lastToolAt ? ` • ${agoStr(s.lastToolAt)}` : '';
      toolParts.push(<span key="lasttool">🔧 {s.lastTool}{ago}</span>);
    }
  }

  if (cfg.showSubagents && runningAgents.length > 0) {
    toolParts.push(
      <span key="agents" className="text-branch">
        subagents: {runningAgents.map(a => `🤖 ${a.type} (running)`).join(', ')}
      </span>
    );
  }

  if (toolParts.length > 0) {
    toolRow = (
      <div className="text-sm text-dim whitespace-nowrap overflow-hidden text-ellipsis mb-0.5">
        {toolParts.map((p, i) => (
          <React.Fragment key={i}>{i > 0 ? ' • ' : ''}{p}</React.Fragment>
        ))}
      </div>
    );
  }

  const lastMsgRow = !taskText && !toolRow && s.lastMessage && !isActive && !isWaiting
    ? <div className="text-sm text-soft break-words">└ {s.lastMessage}</div>
    : null;

  const alerts: React.ReactNode[] = [];
  if (isWaiting) {
    const waitMsg = s.status === 'waiting_permission' ? '⚠ Waiting for tool approval' : '⚠ Awaiting answer';
    const idleMins = Math.floor((Date.now() - s.lastActivity) / 60000);
    alerts.push(
      <div key="wait" className="text-alert text-sm mb-0.5">{waitMsg} • {idleMins}m idle</div>
    );
  }
  if (s.bashStartedAt && (Date.now() - s.bashStartedAt) > 30_000) {
    const elapsed = Math.floor((Date.now() - s.bashStartedAt) / 60000);
    alerts.push(
      <div key="bash" className="text-alert text-sm mb-0.5">⏳ Bash running {elapsed}m…</div>
    );
  }

  const costBadge = cfg.showCost && s.costUsd != null
    ? <span className="text-soft text-[13px] shrink-0">${s.costUsd.toFixed(4)}</span>
    : null;

  let footer: React.ReactNode = null;
  if (cfg.showModel) {
    if (!tasksRow && (s.model || s.contextPct != null)) {
      footer = (
        <div className="flex items-center gap-2 mt-4">
          {s.model && <span className="bg-model-bg text-accent text-[13px] font-bold px-[5px] py-px rounded-[3px] shrink-0">{s.model}</span>}
          {s.contextPct != null && <ContextBar pct={s.contextPct} />}
          {costBadge}
        </div>
      );
    } else if (s.model || costBadge) {
      footer = (
        <div className="flex items-center gap-2 mt-4">
          {s.model && <span className="bg-model-bg text-accent text-[13px] font-bold px-[5px] py-px rounded-[3px] shrink-0">{s.model}</span>}
          {costBadge}
        </div>
      );
    }
  } else if (costBadge) {
    footer = <div className="flex items-center gap-2 mt-4">{costBadge}</div>;
  }

  return (
    <div
      className={`group ${cardCls}`}
      data-pid={s.pid}
      data-session={s.sessionId}
      data-term={s.termSessionId ?? ''}
      onClick={() => onFocus(s.pid, s.termSessionId)}
    >
      {header}
      {taskText && <div className="text-sm text-[#c0c0c0] mt-[14px] mb-1.5 break-words">📋 {taskText}</div>}
      {streamRow}
      {tasksRow}
      {toolRow}
      {lastMsgRow}
      {alerts}
      {footer}
    </div>
  );
}
