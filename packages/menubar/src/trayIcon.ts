import { Session } from '@claude-dashboard/shared';

export function getTrayLabel(sessions: Session[]): string {
  if (sessions.length === 0) return '';

  const hasPermission = sessions.some((s) => s.status === 'waiting_permission');
  const hasInput      = sessions.some((s) => s.status === 'waiting_input');
  const hasActive     = sessions.some((s) => s.status === 'active');
  const allDone       = sessions.every((s) => s.status === 'done' || s.status === 'idle');

  if (hasPermission) return `🔐 ${sessions.length}`;
  if (hasInput)      return `❓ ${sessions.length}`;
  if (hasActive)     return `🤖 ${sessions.length}`;
  if (allDone)       return '✅';
  return `🤖 ${sessions.length}`;
}

export function getTrayTooltip(sessions: Session[]): string {
  if (sessions.length === 0) return 'No active Claude sessions';
  const lines = sessions.map((s) => {
    const branch = s.worktree ? `[🌿 ${s.worktree}]` : s.branch ?? '';
    return `${s.dirName} ${branch} — ${s.status}`;
  });
  return lines.join('\n');
}
