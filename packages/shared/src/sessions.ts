import * as fs from 'fs';
import { Session } from './types';

export function readSessions(filePath: string): Session[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

export function writeSessions(filePath: string, sessions: Session[]): void {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

export function pruneStaleSessions(sessions: Session[], staleMinutes: number): Session[] {
  const cutoff = Date.now() - staleMinutes * 60 * 1000;
  return sessions.filter((s) => s.lastActivity > cutoff);
}

export function upsertSession(sessions: Session[], updated: Session): Session[] {
  const idx = sessions.findIndex((s) => s.sessionId === updated.sessionId);
  if (idx === -1) return [...sessions, updated];
  const next = [...sessions];
  next[idx] = updated;
  return next;
}
