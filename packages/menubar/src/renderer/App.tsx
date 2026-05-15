import React, { useEffect, useRef, useState } from "react";
import { ipcRenderer } from "./utils/electron";
import { useSessions } from "./hooks/useIpc";
import { Header, ViewMode } from "./components/Header";
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

const VIEW_ORDER: ViewMode[] = ["card", "compact"];

export function App() {
  const { sessions, cardConfig, home } = useSessions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("viewMode");
    if (saved === "oneline") return "compact";
    return (saved as ViewMode | null) ?? "card";
  });
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() =>
    localStorage.getItem("panelCollapsed") === "true"
  );
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
      document.body.style.background = "transparent";
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

  const handleCollapseToggle = () => {
    setIsCollapsed((c) => {
      const next = !c;
      localStorage.setItem("panelCollapsed", String(next));
      return next;
    });
  };

  const handleViewModeChange = () =>
    setViewMode((cur) => {
      const next =
        VIEW_ORDER[(VIEW_ORDER.indexOf(cur) + 1) % VIEW_ORDER.length];
      localStorage.setItem("viewMode", next);
      ipcRenderer.send("set-view-mode", next);
      return next;
    });

  useEffect(() => {
    ipcRenderer.send("set-view-mode", viewMode);
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "viewMode") {
        const v = e.newValue;
        setViewMode(v === "oneline" ? "compact" : (v as ViewMode | null) ?? "card");
      }
      if (e.key === "panelCollapsed") {
        setIsCollapsed(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const handlePopout = () => ipcRenderer.send("open-detached-panel");

  const handlePinToggle = async () => {
    const next = !alwaysOnTop;
    await ipcRenderer.invoke("set-always-on-top", next);
    setAlwaysOnTop(next);
  };

  const handleClose = () => window.close();

  const rootRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const settingsOpenRef = useRef(settingsOpen);
  const historyOpenRef = useRef(historyOpen);
  const isCollapsedRef = useRef(isCollapsed);
  const collapsedAlwaysOpaqueRef = useRef(cardConfig.collapsedAlwaysOpaque ?? false);
  settingsOpenRef.current = settingsOpen;
  historyOpenRef.current = historyOpen;
  isCollapsedRef.current = isCollapsed;
  collapsedAlwaysOpaqueRef.current = cardConfig.collapsedAlwaysOpaque ?? false;

  // DOM hover listeners — use refs to avoid stale closures from the one-time effect
  useEffect(() => {
    if (!isDetached) return;
    const el = rootRef.current;
    if (!el) return;
    const syncOpacity = () => {
      const opaque = isHoveredRef.current
        || (!isCollapsedRef.current && (settingsOpenRef.current || historyOpenRef.current))
        || (isCollapsedRef.current && collapsedAlwaysOpaqueRef.current);
      ipcRenderer.send("detached-hover", opaque);
    };
    const onEnter = () => { isHoveredRef.current = true; ipcRenderer.send("detached-hover", true); };
    const onLeave = () => { isHoveredRef.current = false; syncOpacity(); };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [isDetached]);

  // Keep panel opaque while settings or history is open (expanded only), or when collapsed + always-opaque is on
  useEffect(() => {
    if (!isDetached) return;
    const opaque = isHoveredRef.current
      || (!isCollapsed && (settingsOpen || historyOpen))
      || (isCollapsed && (cardConfig.collapsedAlwaysOpaque ?? false));
    ipcRenderer.send("detached-hover", opaque);
  }, [settingsOpen, historyOpen, isCollapsed, cardConfig.collapsedAlwaysOpaque, isDetached]);

  return (
    <div
      ref={rootRef}
      className="flex flex-col flex-1 min-h-0 bg-base"
    >
      <Header
        isDetached={isDetached}
        isSettingsOpen={settingsOpen}
        isHistoryOpen={historyOpen}
        viewMode={viewMode}
        alwaysOnTop={alwaysOnTop}
        isCollapsed={isCollapsed}
        onSettingsToggle={handleSettingsToggle}
        onHistoryToggle={handleHistoryToggle}
        onViewModeChange={handleViewModeChange}
        onCollapseToggle={handleCollapseToggle}
        onPopout={handlePopout}
        onPinToggle={handlePinToggle}
        onClose={handleClose}
        sessions={sessions}
      />
      {!isCollapsed && (
        settingsOpen ? (
          <SettingsPanel
            onSave={() => {
              setSettingsOpen(false);
              ipcRenderer.send("resize-to-fit");
            }}
            onCancel={() => setSettingsOpen(false)}
            onThemeChange={applyTheme}
          />
        ) : historyOpen ? (
          <HistoryPanel showCost={cardConfig.showCost} home={home} modelColors={cardConfig.modelColors} />
        ) : (
          <div
            id="sessions"
            className={`flex flex-col overflow-y-auto flex-1 min-h-0 ${viewMode !== "card" ? "overflow-x-hidden" : "gap-1.5 px-2 pt-1.5"}`}
          >
            <SessionList
              sessions={sessions}
              cardConfig={cardConfig}
              home={home}
              viewMode={viewMode}
            />
          </div>
        )
      )}
    </div>
  );
}
