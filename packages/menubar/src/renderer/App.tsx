import React, { useEffect, useRef, useState } from "react";
import { ipcRenderer } from "./utils/electron";
import { useSessions } from "./hooks/useIpc";
import { Header } from "./components/Header";
import { SessionList } from "./components/SessionList";
import { SettingsPanel } from "./components/SettingsPanel";
import { HistoryPanel } from "./components/HistoryPanel";

export function applyTheme(theme: "light" | "dark") {
  let styleEl = document.getElementById(
    "theme-vars",
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "theme-vars";
    document.head.appendChild(styleEl);
  }
  if (theme === "dark") {
    styleEl.textContent = `
      :root, :host {
        --color-base: #141414;
        --color-surface: #141414;
        --color-line: #252525;
        --color-edge: #2a2a2a;
        --color-body: #d4d4d4;
        --color-bright: #e0e0e0;
        --color-brighter: #e8e8e8;
        --color-soft: #aaaaaa;
        --color-dim: #888888;
        --color-faint: #aaaaaa;
        --color-fainter: #555555;
        --color-path: #cccccc;
        --color-accent: #5acce0;
        --color-active-border: #238636;
        --color-waiting-border: #b45309;
        --color-branch: #0ef00e;
        --color-git: #aaaaaa;
        --color-tool: #9a5dc0;
        --color-alert: #c07800;
        --color-badge-active: #3fb950;
        --color-badge-waiting: #d97706;
        --color-badge-done: #888888;
        --color-badge-idle: #777777;
        --color-badge-loop: #c75050;
        --color-model-bg: #0a3a42;
        --color-ctx-fill: #00c200;
        --color-ctx-warn: #cc6e00;
        --color-ctx-crit: #b50505;
        --color-ctx-track: #888888;
      }
    `;
  } else {
    styleEl.textContent = "";
  }
}

export function App() {
  const { sessions, cardConfig, home } = useSessions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const isDetached = window.location.hash === "#detached";

  // Apply saved theme on mount
  useEffect(() => {
    ipcRenderer.invoke("get-config").then((cfg: { theme?: string }) => {
      applyTheme((cfg.theme ?? "light") as "light" | "dark");
    });
  }, []);

  // Resize the window to fit content after every render
  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      ipcRenderer.send("resize-to-fit");
    });
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  });

  useEffect(() => {
    if (isDetached) {
      document.body.classList.add("detached");
    }
  }, [isDetached]);

  const handleSettingsToggle = () => {
    setSettingsOpen((o) => !o);
    setHistoryOpen(false);
  };

  const handleHistoryToggle = () => {
    setHistoryOpen((o) => !o);
    setSettingsOpen(false);
  };

  const handlePopout = () => ipcRenderer.send("open-detached-panel");

  const handlePinToggle = async () => {
    const next = !alwaysOnTop;
    await ipcRenderer.invoke("set-always-on-top", next);
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
          onSave={() => {
            setSettingsOpen(false);
            ipcRenderer.send("resize-to-fit");
          }}
          onCancel={() => setSettingsOpen(false)}
          onThemeChange={applyTheme}
        />
      ) : historyOpen ? (
        <HistoryPanel showCost={cardConfig.showCost} home={home} />
      ) : (
        <div
          id="sessions"
          className="flex flex-col gap-1.5 px-2 py-1.5 overflow-y-auto flex-1 min-h-0"
        >
          <SessionList
            sessions={sessions}
            cardConfig={cardConfig}
            home={home}
          />
        </div>
      )}
    </>
  );
}
