import React, { useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ipcRenderer, clipboard } from '../utils/electron';
import { SessionRow, CardConfig } from '../types';
import { SessionCard } from './SessionCard';
import { CompactSessionRow } from './CompactSessionRow';

interface SessionListProps {
  sessions: SessionRow[];
  cardConfig: CardConfig;
  home: string;
  compactMode?: boolean;
}

export function SessionList({ sessions, cardConfig, home, compactMode = false }: SessionListProps) {
  const prevNonDoneIds = useRef<Set<string>>(new Set());

  const newSessionIds = new Set<string>();
  for (const s of sessions) {
    if (s.status === 'done' && prevNonDoneIds.current.has(s.sessionId)) {
      newSessionIds.add(s.sessionId);
    }
  }
  prevNonDoneIds.current = new Set(
    sessions.filter(s => s.status !== 'done').map(s => s.sessionId)
  );

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

  if (compactMode) {
    return (
      <div className="flex flex-col">
        <div
          className="grid items-center gap-2 px-3 py-1 border-b border-edge text-fainter text-[11px] uppercase tracking-wider bg-base shrink-0"
          style={{ gridTemplateColumns: '20px 130px 1fr 65px 80px' }}
        >
          <span></span>
          <span>Project</span>
          <span>Task</span>
          <span>Context %</span>
          <span>Time</span>
        </div>
        {sessions.map((session) => (
          <CompactSessionRow
            key={session.sessionId}
            session={session}
            cardConfig={cardConfig}
            home={home}
            onFocus={handleFocus}
          />
        ))}
      </div>
    );
  }

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {sessions.map((session) => (
        <motion.div
          key={session.sessionId}
          layout
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.3 } }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <SessionCard
            session={session}
            cardConfig={cardConfig}
            home={home}
            isNew={newSessionIds.has(session.sessionId)}
            onFocus={handleFocus}
            onDismiss={handleDismiss}
            onCopyPath={handleCopyPath}
          />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
