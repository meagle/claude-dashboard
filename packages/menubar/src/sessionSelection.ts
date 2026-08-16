import type { Session } from "@claude-dashboard/shared";

export interface SelectDeps {
  now: number;
  staleMinutes: number;
  isAlive: (pid: number) => boolean;
}

// Selects which sessions the dashboard should display, from the full set.
//
// Card lifetime is governed SOLELY by `staleMinutes` — a session drops off the
// dashboard once it has been inactive that long — and this rule is applied
// identically to every agent. We deliberately do NOT fast-remove a session just
// because its process has exited: agents differ in process model (Claude Code
// runs one long-lived process for the whole session; Cursor and Codex spawn a
// short-lived process per turn that exits between turns), so pid-liveness is not
// a reliable "the session is over" signal. A dead pid only downgrades a still-
// "active" card to "done"; it never clears the card early.
//
// (Previously a `done` + dead-pid session was dropped after a hardcoded 60s
// regardless of `staleMinutes`. That cleared Cursor/Codex cards mid-session,
// since their process is dead between turns — the bug this function fixes.)
export function selectVisibleSessions(sessions: Session[], deps: SelectDeps): Session[] {
  const { now, staleMinutes, isAlive } = deps;
  const cutoff = now - staleMinutes * 60 * 1000;

  const live = sessions
    .filter((s) => s.lastActivity > cutoff)
    .filter((s) => !s.dismissed)
    .map((s): Session =>
      s.status !== "done" && !isAlive(s.pid)
        ? { ...s, status: "done" as const }
        : s,
    );

  // Deduplicate by pid+termSessionId: the same terminal reused after Escape
  // produces two entries sharing these fields. Keep the newest by startedAt.
  const groups = new Map<string, Session[]>();
  const ungrouped: Session[] = [];
  for (const s of live) {
    const k = s.pid && s.termSessionId ? `${s.pid}:${s.termSessionId}` : null;
    if (!k) {
      ungrouped.push(s);
      continue;
    }
    const g = groups.get(k) ?? [];
    g.push(s);
    groups.set(k, g);
  }
  const deduped: Session[] = [...ungrouped];
  for (const group of groups.values()) {
    group.sort((a, b) => b.startedAt - a.startedAt);
    deduped.push(group[0]); // older duplicates are dropped
  }
  return deduped;
}
