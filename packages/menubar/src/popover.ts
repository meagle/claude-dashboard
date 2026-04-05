// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = (require as (module: string) => any)('electron');

interface SessionRow {
  sessionId: string;
  pid: number;
  dirName: string;
  branch: string | null;
  worktree: string | null;
  status: string;
  completionPct: number;
  costUsd: number | null;
  startedAt: number;
  dismissed: boolean;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'waiting_permission': return '🔐';
    case 'waiting_input':      return '❓';
    case 'active':             return '●';
    case 'done':               return '✅';
    default:                   return '○';
  }
}

function elapsed(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
}

function renderSessions(sessions: SessionRow[], showCost: boolean) {
  const container = document.getElementById('sessions')!;
  container.innerHTML = '';

  const sorted = [...sessions].sort((a, b) => {
    const priority = (s: SessionRow) =>
      s.status === 'waiting_permission' ? 0 :
      s.status === 'waiting_input'      ? 1 : 2;
    return priority(a) - priority(b);
  });

  sorted.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'session-row';

    const branch = s.worktree ? `[🌿 ${s.worktree}]` : s.branch ?? '';
    const costStr = showCost && s.costUsd !== null ? ` ~$${s.costUsd.toFixed(2)}` : '';

    row.innerHTML = `
      <span class="badge">${statusIcon(s.status)}</span>
      <span class="name">${s.dirName}</span>
      <span class="branch">${branch}</span>
      <span class="status">${elapsed(s.startedAt)}</span>
      <span class="cost">${costStr}</span>
    `;

    row.addEventListener('click', () => {
      ipcRenderer.send('focus-terminal', s.pid);
    });

    container.appendChild(row);
  });
}

(window as any).openTUI = () => {
  ipcRenderer.send('open-tui');
};

ipcRenderer.on('sessions-update', (_: unknown, data: { sessions: SessionRow[]; showCost: boolean }) => {
  renderSessions(data.sessions, data.showCost);
});
