import { useState, useEffect } from 'react';
import chokidar from 'chokidar';
import { readSessions, pruneStaleSessions, Session } from '@claude-dashboard/shared';

export function useSessionsFile(filePath: string, staleMinutes: number): Session[] {
  const [sessions, setSessions] = useState<Session[]>(() =>
    pruneStaleSessions(readSessions(filePath), staleMinutes)
  );

  useEffect(() => {
    const refresh = () =>
      setSessions(pruneStaleSessions(readSessions(filePath), staleMinutes));

    const watcher = chokidar.watch(filePath, { ignoreInitial: false });
    watcher.on('add', refresh);
    watcher.on('change', refresh);

    return () => {
      watcher.close();
    };
  }, [filePath, staleMinutes]);

  return sessions;
}
