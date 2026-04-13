import React, { useRef, useCallback } from 'react';
import { ipcRenderer, clipboard } from '../utils/electron';
import { SessionRow, CardConfig } from '../types';
import { SessionCard } from './SessionCard';

interface SessionListProps {
  sessions: SessionRow[];
  cardConfig: CardConfig;
  home: string;
}

export function SessionList({ sessions, cardConfig, home }: SessionListProps) {
  const prevSessionIds = useRef<Set<string>>(new Set());

  const newSessionIds = new Set<string>();
  for (const s of sessions) {
    if (s.status === 'done' && !prevSessionIds.current.has(s.sessionId)) {
      newSessionIds.add(s.sessionId);
    }
  }
  prevSessionIds.current = new Set(sessions.map(s => s.sessionId));

  const handleFocus = useCallback((pid: number, termSessionId: string | null) => {
    ipcRenderer.send('focus-terminal', pid, termSessionId);
  }, []);

  const handleDismiss = useCallback((sessionId: string) => {
    ipcRenderer.send('dismiss-session', sessionId);
  }, []);

  const handleCopyPath = useCallback((workingDir: string) => {
    clipboard.writeText(workingDir);
  }, []);

  if (sessions.length === 0) {
    return <div className="text-faint text-[13px] text-center py-8">No active Claude sessions</div>;
  }

  return (
    <>
      {sessions.map((session, idx) => (
        <SessionCard
          key={session.sessionId}
          session={session}
          cardConfig={cardConfig}
          home={home}
          isNew={newSessionIds.has(session.sessionId)}
          onFocus={handleFocus}
          onDismiss={handleDismiss}
          onCopyPath={handleCopyPath}
        />
      ))}
    </>
  );
}
