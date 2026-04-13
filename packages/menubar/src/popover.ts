// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = (require as (module: string) => any)('electron');

interface TaskSummary {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface SubagentSummary {
  id: string;
  type: string;
  status: 'running' | 'done';
}

interface SessionRow {
  sessionId: string;
  pid: number;
  termSessionId: string | null;
  workingDir: string;
  dirName: string;
  branch: string | null;
  worktree: string | null;
  status: string;
  currentTool: string | null;
  lastTool: string | null;
  lastToolAt: number | null;
  lastToolSummary: string | null;
  lastPrompt: string | null;
  lastMessage: string | null;
  currentTask: string | null;
  tasks: TaskSummary[];
  subagents: SubagentSummary[];
  completionPct: number;
  costUsd: number | null;
  turns: number | null;
  model: string | null;
  contextPct: number | null;
  bashStartedAt: number | null;
  gitSummary: string | null;
  transcriptPath: string | null;
  partialResponse: string | null;
  errorState: boolean;
  loopTool: string | null;
  loopCount: number;
  startedAt: number;
  turnStartedAt: number | null;
  lastActivity: number;
  dismissed: boolean;
}

const prevStatus = new Map<string, string>();

function elapsedStr(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h${mins % 60}m` : `${mins}m`;
}

function agoStr(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${mins % 60}m ago`;
}

function compactPath(workingDir: string, home: string): string {
  const rel = workingDir.startsWith(home) ? '~' + workingDir.slice(home.length) : workingDir;
  const parts = rel.split('/').filter(Boolean);
  if (rel.startsWith('~')) parts[0] = '~';
  if (parts.length <= 2) return rel;
  return [parts[0], ...parts.slice(1, -1).map(p => p.charAt(0)), parts[parts.length - 1]].join('/');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function ctxBarHtml(pct: number): string {
  const cls = pct >= 80 ? 'ctx-fill crit' : pct >= 60 ? 'ctx-fill warn' : 'ctx-fill';
  return `<div class="ctx-track"><div class="${cls}" style="width:${pct}%"></div></div><span class="ctx-pct">${pct}%</span>`;
}

function renderCard(s: SessionRow, idx: number, home: string, isNew: boolean, cfg: CardConfig = currentCardConfig): string {
  const isDone    = s.status === 'done';
  const isActive  = s.status === 'active';
  const isWaiting = s.status === 'waiting_permission' || s.status === 'waiting_input';

  const statusCls = isWaiting ? 'waiting' : isActive ? 'active' : isDone ? 'done' : '';
  const flashCls  = isNew ? ' newly-done' : '';

  // Status badge — dot style to match target
  let badge: string;
  if (isDone)                                 badge = `<span class="badge-done">● DONE</span>`;
  else if (s.status === 'waiting_permission') badge = `<span class="badge-waiting">● PERMISSION</span>`;
  else if (s.status === 'waiting_input')      badge = `<span class="badge-waiting">● INPUT</span>`;
  else if (isActive)                          badge = `<span class="badge-active">● ACTIVE</span>`;
  else                                        badge = `<span class="badge-idle">○ IDLE</span>`;

  if (s.errorState) {
    const toolInfo = s.loopTool ? ` 🔧 ${esc(s.loopTool)} ×${s.loopCount}` : '';
    badge += ` <span class="badge-loop">LOOP${toolInfo}</span>`;
  }

  const turnMs      = s.turnStartedAt != null ? Date.now() - s.turnStartedAt : Date.now() - s.startedAt;
  const timeLabel   = isDone ? agoStr(s.lastActivity) : elapsedStr(turnMs);
  const branchLabel = cfg.showBranch
    ? [
        s.branch,
        s.worktree && s.worktree !== s.branch ? `🌿 ${s.worktree}` : s.worktree ? '🌿' : null,
      ].filter(Boolean).join(' ')
    : '';
  const gitLabel    = cfg.showGitSummary && s.gitSummary ? s.gitSummary : '';
  const pathStr     = cfg.compactPaths ? compactPath(s.workingDir, home) : (s.workingDir.startsWith(home) ? '~' + s.workingDir.slice(home.length) : s.workingDir);

  // ── Header: top row (badge · dirname · elapsed), sub row (path · branch · git) ──
  const header = `
    <div class="card-header">
      <div class="card-header-top">
        ${badge}
        <span class="dirname">${esc(s.dirName)}</span>
        <span class="elapsed">${esc(timeLabel)}</span>
        ${isDone ? '<button class="dismiss-btn" title="Dismiss">✕</button>' : ''}
      </div>
      ${(pathStr || branchLabel || gitLabel) ? `
      <div class="card-header-sub">
        <span class="card-path-wrap" title="Click to copy full path">
          <span class="card-path">${esc(pathStr)}</span>
          <span class="copy-icon"><svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5H3.5A1.5 1.5 0 0 0 2 3h12a1.5 1.5 0 0 0-1.5-1.5H11A1.5 1.5 0 0 0 9.5 0h-3z"/></svg></span>
        </span>
        ${branchLabel ? `<span class="branch">${esc(branchLabel)}</span>` : ''}
        ${gitLabel ? `<span class="git-summary">git ${esc(gitLabel)}</span>` : ''}
      </div>` : ''}
    </div>`;

  if (isDone) {
    const prompt  = s.currentTask ?? s.lastPrompt;
    const answer  = s.lastMessage;
    const promptRow = prompt ? `<div class="card-task">📋 ${esc(trunc(prompt))}</div>` : '';
    const answerRow = answer
      ? `<div class="card-qa-answer">↳ ${esc(trunc(answer))} <span class="done-time">• ✅ ${agoStr(s.lastActivity)}</span></div>`
      : `<div class="card-done-row done-time">✅ Completed ${agoStr(s.lastActivity)}</div>`;
    const doneFooter = cfg.showCost && s.costUsd != null
      ? `<div class="card-footer"><span class="cost-badge">$${s.costUsd.toFixed(4)}</span></div>`
      : '';
    return `
      <div class="card ${statusCls}${flashCls}" data-pid="${s.pid}" data-session="${esc(s.sessionId)}" data-term="${esc(s.termSessionId ?? '')}">
        ${header}
        ${promptRow}
        ${answerRow}
        ${doneFooter}
      </div>`;
  }

  // ── Line 2: current task / last prompt ────────────────────────────────────
  const taskText = s.currentTask ?? s.lastPrompt;
  const taskRow = taskText
    ? `<div class="card-task">📋 ${esc(trunc(taskText))}</div>`
    : '';

  // ── Partial / streaming response ─────────────────────────────────────────
  const streamRow = !taskText ? '' : (s.partialResponse
    ? `<div class="card-qa-answer">↳ ${esc(trunc(s.partialResponse))}</div>`
    : (s.currentTool
      ? `<div class="card-qa-answer card-qa-tool">↳ 🔧 ${esc(s.currentTool)}${s.lastToolSummary ? ` <span class="tool-summary">${esc(trunc(s.lastToolSummary, 50))}</span>` : ''}</div>`
      : ''));

  // ── Line 3: task counts + progress bar ────────────────────────────────────
  let tasksRow = '';
  if (s.tasks && s.tasks.length > 0) {
    const completed  = s.tasks.filter(t => t.status === 'completed').length;
    const inProgress = s.tasks.filter(t => t.status === 'in_progress').length;
    const pending    = s.tasks.filter(t => t.status === 'pending').length;
    const counts: string[] = [];
    if (completed)  counts.push(`✅ ${completed}`);
    if (inProgress) counts.push(`🔄 ${inProgress}`);
    if (pending)    counts.push(`⏳ ${pending}`);
    tasksRow = `
      <div class="card-tasks-row">
        <span class="tasks-counts">Tasks: ${counts.join('  ')}</span>
        ${s.contextPct != null ? `<span class="ctx-bar">${ctxBarHtml(s.contextPct)}</span>` : `<span class="ctx-pct">${s.completionPct}%</span>`}
      </div>`;
  }

  // ── Line 4: tool + subagents (only shown when no streamRow covers it) ───────
  const runningAgents = (s.subagents ?? []).filter(a => a.status === 'running');
  let toolRow = '';
  const toolParts: string[] = [];
  // When there's a task row, streamRow shows the tool inline — skip here to avoid duplication
  if (!taskRow) {
    if (s.currentTool) {
      const sum = s.lastToolSummary ? ` <span class="tool-summary">${esc(trunc(s.lastToolSummary, 50))}</span>` : '';
      toolParts.push(`<span class="detail-tool">🔧 ${esc(s.currentTool)}${sum}</span>`);
    } else if (s.lastTool) {
      const ago = s.lastToolAt ? ` <span class="elapsed">• ${agoStr(s.lastToolAt)}</span>` : '';
      toolParts.push(`<span class="detail-value">🔧 ${esc(s.lastTool)}${ago}</span>`);
    }
  }
  if (cfg.showSubagents && runningAgents.length > 0) {
    const agentStr = runningAgents.map(a => `🤖 ${esc(a.type)} (running)`).join(', ');
    toolParts.push(`<span class="detail-agent">subagents: ${agentStr}</span>`);
  }
  if (toolParts.length > 0) {
    toolRow = `<div class="card-tool-row">${toolParts.join(' • ')}</div>`;
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts: string[] = [];
  if (isWaiting) {
    const waitMsg = s.status === 'waiting_permission' ? '⚠ Waiting for tool approval' : '⚠ Awaiting answer';
    const idle = elapsedStr(Date.now() - s.lastActivity);
    alerts.push(`<div class="card-alert">${waitMsg} • ${idle} idle</div>`);
  }
  if (s.bashStartedAt && (Date.now() - s.bashStartedAt) > 30_000) {
    const elapsed = Math.floor((Date.now() - s.bashStartedAt) / 60000);
    alerts.push(`<div class="card-alert">⏳ Bash running ${elapsed}m…</div>`);
  }

  // ── Footer: model + context (when no tasks row) ───────────────────────────
  let footer = '';
  const costBadge = cfg.showCost && s.costUsd != null ? `<span class="cost-badge">$${s.costUsd.toFixed(4)}</span>` : '';
  if (cfg.showModel) {
    if (!tasksRow && (s.model || s.contextPct != null)) {
      footer = `
        <div class="card-footer">
          ${s.model ? `<span class="model-badge">${esc(s.model)}</span>` : ''}
          ${s.contextPct != null ? `<span class="ctx-bar">${ctxBarHtml(s.contextPct)}</span>` : ''}
          ${costBadge}
        </div>`;
    } else if (s.model || costBadge) {
      footer = `<div class="card-footer">${s.model ? `<span class="model-badge">${esc(s.model)}</span>` : ''}${costBadge}</div>`;
    }
  } else if (costBadge) {
    footer = `<div class="card-footer">${costBadge}</div>`;
  }

  // ── Last message (when no task row and no tool row) ───────────────────────
  let lastMsgRow = '';
  if (!taskRow && !toolRow && s.lastMessage && !isActive && !isWaiting) {
    lastMsgRow = `<div class="card-last-msg">└ ${esc(trunc(s.lastMessage))}</div>`;
  }

  return `
    <div class="card ${statusCls}${flashCls}" data-pid="${s.pid}" data-session="${esc(s.sessionId)}" data-term="${esc(s.termSessionId ?? '')}">
      ${header}
      ${taskRow}
      ${streamRow}
      ${tasksRow}
      ${toolRow}
      ${lastMsgRow}
      ${alerts.join('')}
      ${footer}
    </div>`;
}

function renderSessions(sessions: SessionRow[], home: string) {
  const container = document.getElementById('sessions')!;
  const summary   = document.getElementById('summary')!;

  const newlyDone = new Set<string>();
  sessions.forEach((s) => {
    const prev = prevStatus.get(s.sessionId);
    if (s.status === 'done' && prev && prev !== 'done') newlyDone.add(s.sessionId);
    prevStatus.set(s.sessionId, s.status);
  });

  const sorted = [...sessions].sort((a, b) => {
    const rank = (s: SessionRow) =>
      s.status === 'waiting_permission' ? 0 :
      s.status === 'waiting_input'      ? 1 :
      s.status === 'active'             ? 2 : 3;
    const rDiff = rank(a) - rank(b);
    return rDiff !== 0 ? rDiff : b.lastActivity - a.lastActivity;
  });

  const active = sessions.filter(s =>
    s.status === 'active' || s.status === 'waiting_permission' || s.status === 'waiting_input'
  ).length;
  summary.textContent = `${sessions.length} sessions  •  ${active} active`;

  if (sorted.length === 0) {
    container.innerHTML = '<div id="empty">no sessions</div>';
    return;
  }

  container.innerHTML = sorted.map((s, i) => renderCard(s, i, home, newlyDone.has(s.sessionId), currentCardConfig)).join('');

  if (newlyDone.size > 0) {
    setTimeout(() => {
      container.querySelectorAll('.newly-done').forEach(el => el.classList.remove('newly-done'));
    }, 3000);
  }

  container.querySelectorAll<HTMLElement>('.card').forEach(card => {
    card.addEventListener('click', () => {
      const pid  = parseInt(card.dataset.pid ?? '0', 10);
      const term = card.dataset.term || null;
      ipcRenderer.send('focus-terminal', pid, term || null);
    });
  });

  container.querySelectorAll<HTMLElement>('.dismiss-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest<HTMLElement>('.card');
      const sessionId = card?.dataset.session;
      if (sessionId) ipcRenderer.send('dismiss-session', sessionId);
    });
  });

  container.querySelectorAll<HTMLElement>('.card-path-wrap').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = wrap.closest<HTMLElement>('.card');
      const sessionId = card?.dataset.session;
      const session = currentSessions.find(s => s.sessionId === sessionId);
      if (!session) return;
      const { clipboard } = (require as (m: string) => any)('electron');
      clipboard.writeText(session.workingDir);
      const pathText = wrap.querySelector<HTMLElement>('.card-path');
      if (!pathText) return;
      const orig = pathText.textContent;
      pathText.textContent = 'copied!';
      pathText.style.color = '#5acce0';
      setTimeout(() => {
        pathText.textContent = orig;
        pathText.style.color = '';
      }, 1500);
    });
  });

}

interface CardConfig {
  showBranch: boolean;
  showGitSummary: boolean;
  showSubagents: boolean;
  showModel: boolean;
  compactPaths: boolean;
  showCost: boolean;
}

let currentCardConfig: CardConfig = { showBranch: true, showGitSummary: true, showSubagents: true, showModel: true, compactPaths: true, showCost: false };
let currentHome = '';
let currentSessions: SessionRow[] = [];

ipcRenderer.on('sessions-update', (_: unknown, data: { sessions: SessionRow[]; cardConfig: CardConfig; home: string }) => {
  currentCardConfig = data.cardConfig ?? currentCardConfig;
  currentHome = data.home;
  currentSessions = data.sessions;
  renderSessions(data.sessions, data.home);
});

// ── Detached panel mode ───────────────────────────────────────────────────────
const isDetached = window.location.hash === '#detached';
if (isDetached) document.body.classList.add('detached');

const popoutBtn = document.getElementById('popout-btn')!;
popoutBtn.addEventListener('click', () => {
  ipcRenderer.send('open-detached-panel');
});

if (isDetached) {
  let alwaysOnTop = true;
  const pinBtn   = document.getElementById('pin-btn')!;
  const closeBtn = document.getElementById('close-btn')!;

  pinBtn.classList.add('pinned');
  pinBtn.addEventListener('click', async () => {
    alwaysOnTop = !alwaysOnTop;
    await ipcRenderer.invoke('set-always-on-top', alwaysOnTop);
    pinBtn.classList.toggle('pinned', alwaysOnTop);
    pinBtn.title = alwaysOnTop ? 'Always on top (click to disable)' : 'Always on top (click to enable)';
  });

  closeBtn.addEventListener('click', () => {
    window.close();
  });
}

// ── Settings panel ────────────────────────────────────────────────────────────
const settingsBtn         = document.getElementById('settings-btn')!;
const settingsPanel       = document.getElementById('settings-panel')!;
const sessionsDiv         = document.getElementById('sessions')!;
const staleInput          = document.getElementById('stale-minutes') as HTMLInputElement;
const branchToggle        = document.getElementById('show-branch') as HTMLInputElement;
const gitSummaryToggle    = document.getElementById('show-git-summary') as HTMLInputElement;
const subagentsToggle     = document.getElementById('show-subagents') as HTMLInputElement;
const modelToggle         = document.getElementById('show-model') as HTMLInputElement;
const compactPathsToggle  = document.getElementById('show-compact-paths') as HTMLInputElement;
const costToggle          = document.getElementById('show-cost') as HTMLInputElement;
const notificationsToggle = document.getElementById('show-notifications') as HTMLInputElement;
const soundToggle         = document.getElementById('notification-sound') as HTMLInputElement;
const saveBtn             = document.getElementById('save-settings')!;

settingsBtn.addEventListener('click', async () => {
  const opening = !settingsPanel.classList.contains('open');
  settingsPanel.classList.toggle('open', opening);
  sessionsDiv.style.display = opening ? 'none' : 'flex';
  settingsBtn.classList.toggle('active', opening);

  if (opening) {
    const config = await ipcRenderer.invoke('get-config');
    if (staleInput)          staleInput.value            = String(config.staleSessionMinutes ?? 30);
    if (branchToggle)        branchToggle.checked        = config.columns?.gitBranch    ?? true;
    if (gitSummaryToggle)    gitSummaryToggle.checked    = config.columns?.changedFiles ?? true;
    if (subagentsToggle)     subagentsToggle.checked     = config.columns?.subagents    ?? true;
    if (modelToggle)         modelToggle.checked         = config.columns?.lastAction   ?? true;
    if (compactPathsToggle)  compactPathsToggle.checked  = config.columns?.compactPaths ?? true;
    if (costToggle)          costToggle.checked          = config.columns?.cost         ?? true;
    if (notificationsToggle) notificationsToggle.checked = config.notifications         ?? true;
    if (soundToggle)         soundToggle.checked         = config.notificationSound     ?? true;
  }

  ipcRenderer.send('resize-to-fit');
});

saveBtn.addEventListener('click', async () => {
  const minutes = Math.max(5, Math.min(480, parseInt(staleInput?.value ?? '30') || 30));
  await ipcRenderer.invoke('save-config', {
    staleSessionMinutes: minutes,
    notifications:      notificationsToggle?.checked ?? true,
    notificationSound:  soundToggle?.checked         ?? true,
    columns: {
      gitBranch:    branchToggle?.checked       ?? true,
      changedFiles: gitSummaryToggle?.checked   ?? true,
      subagents:    subagentsToggle?.checked     ?? true,
      lastAction:   modelToggle?.checked         ?? true,
      compactPaths: compactPathsToggle?.checked  ?? true,
      cost:         costToggle?.checked          ?? true,
    },
  });
  settingsPanel.classList.remove('open');
  sessionsDiv.style.display = 'flex';
  settingsBtn.classList.remove('active');
  ipcRenderer.send('resize-to-fit');
});
