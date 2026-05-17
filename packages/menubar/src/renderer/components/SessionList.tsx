import React, { useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ipcRenderer, clipboard } from "../utils/electron";
import { SessionRow, CardConfig } from "../types";
import { SessionCard } from "./SessionCard";
import { CompactSessionRow } from "./CompactSessionRow";
import { DesktopPresenceCard } from "./DesktopPresenceCard";
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

  // Separate desktop presence from regular sessions
  const hasDesktop = cardConfig.showDesktopPresence && sessions.some((s) => s.source === 'desktop');
  const regularSessions = sessions.filter((s) => s.source !== 'desktop');

  const newSessionIds = new Set<string>();
  for (const s of regularSessions) {
    if (s.status === "done" && prevNonDoneIds.current.has(s.sessionId)) {
      newSessionIds.add(s.sessionId);
    }
  }
  prevNonDoneIds.current = new Set(
    regularSessions.filter((s) => s.status !== "done").map((s) => s.sessionId),
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

  if (regularSessions.length === 0 && !hasDesktop) {
    return (
      <div className="text-faint text-[13px] text-center py-8">
        No active Claude sessions
      </div>
    );
  }

  if (viewMode === 'compact') {
    return (
      <div className="flex flex-col">
        {regularSessions.map((session) => (
          <CompactSessionRow
            key={session.sessionId}
            session={session}
            cardConfig={cardConfig}
            onFocus={handleFocus}
          />
        ))}
        {hasDesktop && <DesktopPresenceCard viewMode="compact" />}
      </div>
    );
  }

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {regularSessions.map((session) => (
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
      {hasDesktop && (
        <motion.div
          key="desktop-presence"
          layout
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.3 } }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <DesktopPresenceCard viewMode="card" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
