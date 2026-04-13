import React, { useEffect, useRef, useState } from 'react';
import { ipcRenderer } from './utils/electron';
import { useSessions } from './hooks/useIpc';
import { Header } from './components/Header';
import { SessionList } from './components/SessionList';
import { SettingsPanel } from './components/SettingsPanel';

export function App() {
  const { sessions, cardConfig, home } = useSessions();
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  const handleSettingsToggle = () => setSettingsOpen(o => !o);

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
        alwaysOnTop={alwaysOnTop}
        onSettingsToggle={handleSettingsToggle}
        onPopout={handlePopout}
        onPinToggle={handlePinToggle}
        onClose={handleClose}
      />
      {settingsOpen ? (
        <SettingsPanel
          onSave={() => { setSettingsOpen(false); ipcRenderer.send('resize-to-fit'); }}
          onCancel={() => setSettingsOpen(false)}
        />
      ) : (
        <div id="sessions">
          <SessionList sessions={sessions} cardConfig={cardConfig} home={home} />
        </div>
      )}
    </>
  );
}
