import React, { useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ipcRenderer, clipboard } from "../utils/electron";
import { SessionRow, CardConfig } from "../types";
import { SessionCard } from "./SessionCard";
import { CompactSessionRow } from "./CompactSessionRow";
import { OneLineSessionRow } from "./OneLineSessionRow";
import { ViewMode } from "./Header";

interface SessionListProps {
  sessions: SessionRow[];
  cardConfig: CardConfig;
  home: string;
  viewMode?: ViewMode;
}

export function SessionList({
  sessions,
  cardConfig,
  home,
  viewMode = 'card',
}: SessionListProps) {
  const prevNonDoneIds = useRef<Set<string>>(new Set());

  const newSessionIds = new Set<string>();
  for (const s of sessions) {
    if (s.status === "done" && prevNonDoneIds.current.has(s.sessionId)) {
      newSessionIds.add(s.sessionId);
    }
  }
  prevNonDoneIds.current = new Set(
    sessions.filter((s) => s.status !== "done").map((s) => s.sessionId),
  );

  const handleFocus = useCallback(
    (pid: number, termSessionId: string | null) => {
      ipcRenderer.send("focus-terminal", pid, termSessionId);
    },
    [],
  );

  const handleDismiss = useCallback((sessionId: string) => {
    ipcRenderer.send("dismiss-session", sessionId);
  }, []);

  const handleCopyPath = useCallback((workingDir: string) => {
    clipboard.writeText(workingDir);
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="text-faint text-[13px] text-center py-8">
        No active Claude sessions
      </div>
    );
  }

  if (viewMode === 'oneline') {
    return (
      <div className="flex flex-col">
        {sessions.map((session) => (
          <OneLineSessionRow
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

  if (viewMode === 'compact') {
    return (
      <div className="flex flex-col">
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
          transition={{ duration: 0.4, ease: "easeOut" }}
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
