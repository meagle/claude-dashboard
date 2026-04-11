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

  if (s.errorState) badge += ` <span class="badge-loop">LOOP</span>`;

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
      </div>
      ${(pathStr || branchLabel || gitLabel) ? `
      <div class="card-header-sub">
        <span class="card-path">${esc(pathStr)}</span>
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
    return `
      <div class="card ${statusCls}${flashCls}" data-pid="${s.pid}" data-term="${esc(s.termSessionId ?? '')}">
        ${header}
        ${promptRow}
        ${answerRow}
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
  if (cfg.showModel) {
    if (!tasksRow && (s.model || s.contextPct != null)) {
      footer = `
        <div class="card-footer">
          ${s.model ? `<span class="model-badge">${esc(s.model)}</span>` : ''}
          ${s.contextPct != null ? `<span class="ctx-bar">${ctxBarHtml(s.contextPct)}</span>` : ''}
        </div>`;
    } else if (s.model) {
      footer = `<div class="card-footer"><span class="model-badge">${esc(s.model)}</span></div>`;
    }
  }

  // ── Last message (when no task row and no tool row) ───────────────────────
  let lastMsgRow = '';
  if (!taskRow && !toolRow && s.lastMessage) {
    lastMsgRow = `<div class="card-last-msg">└ ${esc(trunc(s.lastMessage))}</div>`;
  }

  return `
    <div class="card ${statusCls}${flashCls}" data-pid="${s.pid}" data-term="${esc(s.termSessionId ?? '')}">
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

}

interface CardConfig {
  showBranch: boolean;
  showGitSummary: boolean;
  showSubagents: boolean;
  showModel: boolean;
  compactPaths: boolean;
}

let currentCardConfig: CardConfig = { showBranch: true, showGitSummary: true, showSubagents: true, showModel: true, compactPaths: true };
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
const settingsBtn      = document.getElementById('settings-btn')!;
const settingsPanel    = document.getElementById('settings-panel')!;
const sessionsDiv      = document.getElementById('sessions')!;
const staleInput       = document.getElementById('stale-minutes') as HTMLInputElement;
const branchToggle        = document.getElementById('show-branch') as HTMLInputElement;
const gitSummaryToggle    = document.getElementById('show-git-summary') as HTMLInputElement;
const subagentsToggle     = document.getElementById('show-subagents') as HTMLInputElement;
const modelToggle         = document.getElementById('show-model') as HTMLInputElement;
const compactPathsToggle  = document.getElementById('show-compact-paths') as HTMLInputElement;
const saveBtn             = document.getElementById('save-settings')!;

settingsBtn.addEventListener('click', async () => {
  const opening = !settingsPanel.classList.contains('open');
  settingsPanel.classList.toggle('open', opening);
  sessionsDiv.style.display = opening ? 'none' : 'flex';
  settingsBtn.classList.toggle('active', opening);

  if (opening) {
    const config = await ipcRenderer.invoke('get-config');
    staleInput.value              = String(config.staleSessionMinutes ?? 30);
    branchToggle.checked          = config.columns?.gitBranch      ?? true;
    gitSummaryToggle.checked      = config.columns?.changedFiles   ?? true;
    subagentsToggle.checked       = config.columns?.subagents      ?? true;
    modelToggle.checked           = config.columns?.lastAction     ?? true;
    compactPathsToggle.checked    = config.columns?.compactPaths   ?? true;
  }

  ipcRenderer.send('resize-to-fit');
});

saveBtn.addEventListener('click', async () => {
  const minutes = Math.max(5, Math.min(480, parseInt(staleInput.value) || 30));
  await ipcRenderer.invoke('save-config', {
    staleSessionMinutes: minutes,
    columns: {
      gitBranch:    branchToggle.checked,
      changedFiles: gitSummaryToggle.checked,
      subagents:    subagentsToggle.checked,
      lastAction:   modelToggle.checked,
      compactPaths: compactPathsToggle.checked,
    },
  });
  settingsPanel.classList.remove('open');
  sessionsDiv.style.display = 'flex';
  settingsBtn.classList.remove('active');
  ipcRenderer.send('resize-to-fit');
});
