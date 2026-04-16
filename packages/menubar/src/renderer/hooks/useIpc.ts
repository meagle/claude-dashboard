import { useState, useEffect } from 'react';
import { ipcRenderer } from '../utils/electron';
import { SessionRow, CardConfig } from '../types';

interface SessionsPayload {
  sessions: SessionRow[];
  cardConfig: CardConfig;
  home: string;
}

const DEFAULT_CARD_CONFIG: CardConfig = {
  showBranch: true,
  showGitSummary: true,
  showSubagents: true,
  showModel: true,
  compactPaths: true,
  showCost: false,
  showDoneFooter: true,
  theme: 'light',
};

export function useSessions(): SessionsPayload {
  const [payload, setPayload] = useState<SessionsPayload>({
    sessions: [],
    cardConfig: DEFAULT_CARD_CONFIG,
    home: '',
  });

  useEffect(() => {
    const handler = (_: unknown, data: SessionsPayload) => {
      setPayload({
        sessions: data.sessions ?? [],
        cardConfig: data.cardConfig ?? DEFAULT_CARD_CONFIG,
        home: data.home ?? '',
      });
    };

    ipcRenderer.on('sessions-update', handler);
    return () => {
      ipcRenderer.off('sessions-update', handler);
    };
  }, []);

  return payload;
}
