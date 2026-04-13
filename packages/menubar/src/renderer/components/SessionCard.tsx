import React, { useState, useEffect } from "react";
import { SessionRow, CardConfig } from "../types";
import { Badge } from "./Badge";
import { ContextBar } from "./ContextBar";
import { elapsedStr, agoStr, compactPath } from "../utils/format";

const COPY_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
  const [dots, setDots] = useState("");

  const isDone = s.status === "done";
  const isActive = s.status === "active";
  const isWaiting =
    s.status === "waiting_permission" || s.status === "waiting_input";

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(
      () => setDots((d) => (d.length >= 3 ? "" : d + ".")),
      500,
    );
    return () => clearInterval(id);
  }, [isActive]);

  const turnMs =
    s.turnStartedAt != null
      ? Date.now() - s.turnStartedAt
      : Date.now() - s.startedAt;

  const pathStr = cfg.compactPaths
    ? compactPath(s.workingDir, home)
    : s.workingDir.startsWith(home)
      ? "~" + s.workingDir.slice(home.length)
      : s.workingDir;

  const branchLabel = cfg.showBranch
    ? [
        s.branch,
        s.worktree && s.worktree !== s.branch
          ? `🌿 ${s.worktree}`
          : s.worktree
            ? "🌿"
            : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const gitLabel = cfg.showGitSummary && s.gitSummary ? s.gitSummary : "";
  const elapsedStr2 = !isDone ? elapsedStr(turnMs) : null;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyPath(s.workingDir);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  };

  // Card border + state classes
  const cardBorder = isNew
    ? "border-[#3a8a3a] animate-flash"
    : isWaiting
      ? "border-waiting-border"
      : isActive
        ? "border-active-border"
        : isDone
          ? "border-line opacity-50 hover:opacity-90"
          : "border-edge";

  const cardCls = `border rounded-md px-[11px] pt-2 pb-[7px] cursor-pointer transition-[colors,opacity] duration-150 hover:bg-surface ${cardBorder}`;

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
            className="shrink-0 ml-auto bg-transparent border-none cursor-pointer text-bright text-[13px] leading-none px-0.5 pl-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:text-[#e06060]"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(s.sessionId);
            }}
          >
            ✕
          </button>
        )}
      </div>
      {/* Sub row: path, branch, git, elapsed */}
      {(pathStr || branchLabel || gitLabel || elapsedStr2) && (
        <div
          className="flex items-baseline gap-2.5 flex-wrap"
          style={{ rowGap: "2px" }}
        >
          {pathStr && (
            <span
              className="inline-flex items-center min-w-0 pr-2 shrink cursor-pointer group/path"
              title="Click to copy full path"
              onClick={handleCopyPath}
            >
              <span
                className={`text-sm overflow-hidden text-ellipsis whitespace-nowrap min-w-0 ${pathCopied ? "text-accent" : "text-path group-hover/path:text-soft"}`}
              >
                {pathCopied ? "copied!" : pathStr}
              </span>
              <span className="shrink-0 text-soft px-1.5 inline-flex items-center leading-none transition-colors duration-150 group-hover/path:text-accent">
                {COPY_ICON}
              </span>
            </span>
          )}
          {branchLabel && (
            <span className="text-branch text-sm whitespace-nowrap">
              {branchLabel}
            </span>
          )}
          {gitLabel && (
            <span className="text-git text-sm whitespace-nowrap pl-2">
              git {gitLabel}
            </span>
          )}
          {elapsedStr2 && (
            <span className="text-fainter text-sm whitespace-nowrap">
              {elapsedStr2}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (isDone) {
    const prompt = s.currentTask ?? s.lastPrompt;
    const answer = s.lastMessage;

    const doneCostBadge =
      cfg.showCost && s.costUsd != null ? (
        <span className="text-soft text-[13px] shrink-0">
          ${s.costUsd.toFixed(4)}
        </span>
      ) : null;
    const doneModelBadge =
      cfg.showDoneFooter && s.model ? (
        <span className="bg-model-bg text-accent text-[13px] font-bold px-[5px] py-px rounded-[3px] shrink-0 mr-4">
          {s.model}
        </span>
      ) : null;
    const doneContextBar =
      cfg.showDoneFooter && s.contextPct != null ? (
        <ContextBar pct={s.contextPct} />
      ) : null;
    const doneFooter =
      doneCostBadge || doneModelBadge || doneContextBar ? (
        <div className="flex items-center gap-2 mt-4">
          {doneModelBadge}
          {doneContextBar}
          {doneCostBadge}
        </div>
      ) : null;

    return (
      <div
        className={`group ${cardCls}`}
        data-pid={s.pid}
        data-session={s.sessionId}
        data-term={s.termSessionId ?? ""}
        onClick={() => onFocus(s.pid, s.termSessionId)}
      >
        {header}
        {prompt && (
          <div className="text-sm text-[#c0c0c0] mt-[14px] mb-1.5 break-words">
            📋 {prompt}
          </div>
        )}
        {answer ? (
          <div className="text-sm text-soft break-words pl-[14px] mt-0.5 mb-1">
            ↳ {answer}
          </div>
        ) : (
          <div className="text-sm text-git whitespace-nowrap overflow-hidden text-ellipsis">
            ✅ Completed
          </div>
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
          {s.lastToolSummary && (
            <span className="text-faint"> {s.lastToolSummary}</span>
          )}
        </div>
      );
    } else if (s.partialResponse) {
      streamRow = (
        <div className="text-sm text-soft break-words pl-[14px] mt-0.5 mb-1">
          ↳ {s.partialResponse}
        </div>
      );
    }
  }

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
      <div className="flex items-center justify-between mb-1 text-sm text-soft">
        <span className="shrink-0">Tasks: {counts.join("  ")}</span>
        {s.contextPct != null ? (
          <ContextBar pct={s.contextPct} />
        ) : (
          <span className="text-faint">{s.completionPct}%</span>
        )}
      </div>
    );
  }

  let toolRow: React.ReactNode = null;
  const runningAgents = (s.subagents ?? []).filter(
    (a) => a.status === "running",
  );
  const toolParts: React.ReactNode[] = [];

  if (!taskText) {
    if (s.currentTool) {
      toolParts.push(
        <span key="tool" className="text-tool">
          🔧 {s.currentTool}
          {s.lastToolSummary && (
            <span className="text-faint"> {s.lastToolSummary}</span>
          )}
        </span>,
      );
    } else if (s.lastTool) {
      const ago = s.lastToolAt ? ` • ${agoStr(s.lastToolAt)}` : "";
      toolParts.push(
        <span key="lasttool">
          🔧 {s.lastTool}
          {ago}
        </span>,
      );
    }
  }

  if (cfg.showSubagents && runningAgents.length > 0) {
    toolParts.push(
      <span key="agents" className="text-branch">
        subagents:{" "}
        {runningAgents.map((a) => `🤖 ${a.type} (running)`).join(", ")}
      </span>,
    );
  }

  if (toolParts.length > 0) {
    toolRow = (
      <div className="text-sm text-dim whitespace-nowrap overflow-hidden text-ellipsis mb-0.5">
        {toolParts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 ? " • " : ""}
            {p}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const lastMsgRow =
    !taskText && !toolRow && s.lastMessage && !isActive && !isWaiting ? (
      <div className="text-sm text-soft break-words">└ {s.lastMessage}</div>
    ) : null;

  const alerts: React.ReactNode[] = [];
  if (isWaiting) {
    const waitMsg =
      s.status === "waiting_permission"
        ? "⚠ Waiting for tool approval"
        : "⚠ Awaiting answer";
    const idleMins = Math.floor((Date.now() - s.lastActivity) / 60000);
    alerts.push(
      <div key="wait" className="text-alert text-sm mb-0.5">
        {waitMsg} • {idleMins}m idle
      </div>,
    );
  }
  if (s.bashStartedAt && Date.now() - s.bashStartedAt > 30_000) {
    const elapsed = Math.floor((Date.now() - s.bashStartedAt) / 60000);
    alerts.push(
      <div key="bash" className="text-alert text-sm mb-0.5">
        ⏳ Bash running {elapsed}m…
      </div>,
    );
  }

  const costBadge =
    cfg.showCost && s.costUsd != null ? (
      <span className="text-soft text-[13px] shrink-0">
        ${s.costUsd.toFixed(4)}
      </span>
    ) : null;

  let footer: React.ReactNode = null;
  if (cfg.showModel) {
    if (!tasksRow && (s.model || s.contextPct != null)) {
      footer = (
        <div className="flex items-center gap-2 mt-4">
          {s.model && (
            <span className="bg-model-bg text-accent text-[13px] font-bold px-[5px] py-px rounded-[3px] shrink-0">
              {s.model}
            </span>
          )}
          {s.contextPct != null && <ContextBar pct={s.contextPct} />}
          {costBadge}
        </div>
      );
    } else if (s.model || costBadge) {
      footer = (
        <div className="flex items-center gap-2 mt-4">
          {s.model && (
            <span className="bg-model-bg text-accent text-[13px] font-bold px-[5px] py-px rounded-[3px] shrink-0">
              {s.model}
            </span>
          )}
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
      data-term={s.termSessionId ?? ""}
      onClick={() => onFocus(s.pid, s.termSessionId)}
    >
      {header}
      {taskText && (
        <div className="text-sm text-[#c0c0c0] mt-[14px] mb-1.5 break-words">
          📋 {taskText}
        </div>
      )}
      {streamRow ??
        (isActive && taskText ? (
          <div className="text-sm italic pl-[14px] mt-0.5 mb-1 text-white flex items-center gap-1.5">
            <svg
              className="animate-pulse shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              shape-rendering="geometricPrecision"
              text-rendering="geometricPrecision"
              image-rendering="optimizeQuality"
              fill-rule="evenodd"
              clip-rule="evenodd"
              viewBox="0 0 512 509.64"
              width="14"
              height="14"
            >
              <path
                fill="#D77655"
                d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.612-115.613 115.612H115.612C52.026 509.639 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"
              />
              <path
                fill="#FCF2EE"
                fill-rule="nonzero"
                d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474-.101.102.024.101z"
              />
            </svg>
            Clauding{dots}
          </div>
        ) : null)}
      {tasksRow}
      {toolRow}
      {lastMsgRow}
      {alerts}
      {footer}
    </div>
  );
}
