import React, { useEffect, useRef, useState } from 'react';
import { ipcRenderer } from './utils/electron';
import { useSessions } from './hooks/useIpc';
import { Header } from './components/Header';
import { SessionList } from './components/SessionList';
import { SettingsPanel } from './components/SettingsPanel';
import { HistoryPanel } from './components/HistoryPanel';

export function App() {
  const { sessions, cardConfig, home } = useSessions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const isDetached = window.location.hash === '#detached';

  // Resize the window to fit content after every render
  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      ipcRenderer.send('resize-to-fit');
    });
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  });

  useEffect(() => {
    if (isDetached) {
      document.body.classList.add('detached');
    }
  }, [isDetached]);

  const handleSettingsToggle = () => {
    setSettingsOpen(o => !o);
    setHistoryOpen(false);
  };

  const handleHistoryToggle = () => {
    setHistoryOpen(o => !o);
    setSettingsOpen(false);
  };

  const handlePopout = () => ipcRenderer.send('open-detached-panel');

  const handlePinToggle = async () => {
    const next = !alwaysOnTop;
    await ipcRenderer.invoke('set-always-on-top', next);
    setAlwaysOnTop(next);
  };

  const handleClose = () => window.close();

  return (
    <>
      <Header
        isDetached={isDetached}
        isSettingsOpen={settingsOpen}
        isHistoryOpen={historyOpen}
        alwaysOnTop={alwaysOnTop}
        onSettingsToggle={handleSettingsToggle}
        onHistoryToggle={handleHistoryToggle}
        onPopout={handlePopout}
        onPinToggle={handlePinToggle}
        onClose={handleClose}
      />
      {settingsOpen ? (
        <SettingsPanel
          onSave={() => { setSettingsOpen(false); ipcRenderer.send('resize-to-fit'); }}
          onCancel={() => setSettingsOpen(false)}
        />
      ) : historyOpen ? (
        <HistoryPanel showCost={cardConfig.showCost} />
      ) : (
        <div id="sessions" className="flex flex-col gap-1.5 px-2 py-1.5 overflow-y-auto flex-1 min-h-0">
          <SessionList sessions={sessions} cardConfig={cardConfig} home={home} />
        </div>
      )}
    </>
  );
}
