import * as fs from 'fs';
import * as path from 'path';
import { Session, ArchivedSession } from './types';

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

const HISTORY_DAYS = 30;

export function readHistory(filePath: string): ArchivedSession[] {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ArchivedSession[];
  } catch { return []; }
}

export function appendHistory(filePath: string, sessions: Session[]): void {
  const now = Date.now();
  const cutoff = now - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const existing = readHistory(filePath).filter(s => s.archivedAt > cutoff);
  const toAdd: ArchivedSession[] = sessions.map(s => ({ ...s, archivedAt: now }));
  const tmp = filePath + '.tmp';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify([...existing, ...toAdd], null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

export function upsertSession(sessions: Session[], updated: Session): Session[] {
  const idx = sessions.findIndex((s) => s.sessionId === updated.sessionId);
  if (idx === -1) return [...sessions, updated];
  const next = [...sessions];
  next[idx] = updated;
  return next;
}
