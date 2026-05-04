import React, { useState, useEffect, useCallback } from "react";
import { ipcRenderer } from "../utils/electron";
import { DashboardConfig } from "../types";

interface SettingsPanelProps {
  onSave: () => void;
  onCancel: () => void;
  onThemeChange: (theme: "light" | "dark") => void;
}

interface FormState {
  staleMinutes: number;
  maxHeight: number;
  theme: "light" | "dark";
  gitBranch: boolean;
  changedFiles: boolean;
  subagents: boolean;
  lastAction: boolean;
  compactPaths: boolean;
  cost: boolean;
  doneFooter: boolean;
  notifications: boolean;
  notificationSound: boolean;
  footerStyle: "default" | "grid";
  pinnedPanelOpacity: number;
}

const DEFAULTS: FormState = {
  staleMinutes: 30,
  maxHeight: 700,
  theme: "light",
  gitBranch: true,
  changedFiles: true,
  subagents: true,
  lastAction: true,
  compactPaths: true,
  cost: false,
  doneFooter: true,
  notifications: true,
  notificationSound: true,
  footerStyle: "default",
  pinnedPanelOpacity: 1,
};


function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="relative inline-flex items-center cursor-pointer shrink-0"
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-8 h-4 bg-edge rounded-full transition-colors duration-200 peer-checked:bg-accent relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform after:duration-200 peer-checked:after:translate-x-4" />
    </label>
  );
}

export function SettingsPanel({
  onSave,
  onCancel,
  onThemeChange,
}: SettingsPanelProps) {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // Pull app version from main process. Falls back to '—' if the
    // 'get-app-version' handler isn't registered yet.
    ipcRenderer
      .invoke("get-app-version")
      .then((v: string) => setVersion(typeof v === "string" ? v : null))
      .catch(() => setVersion(null));
  }, []);

  useEffect(() => {
    ipcRenderer.invoke("get-config").then((config: DashboardConfig) => {
      setForm({
        staleMinutes: config.staleSessionMinutes ?? 30,
        maxHeight: config.maxHeight ?? 700,
        theme: config.theme ?? "light",
        gitBranch: config.columns?.gitBranch ?? true,
        changedFiles: config.columns?.changedFiles ?? true,
        subagents: config.columns?.subagents ?? true,
        lastAction: config.columns?.lastAction ?? true,
        compactPaths: config.columns?.compactPaths ?? true,
        cost: config.columns?.cost ?? false,
        doneFooter: config.columns?.doneFooter ?? true,
        notifications: config.notifications ?? true,
        notificationSound: config.notificationSound ?? true,
        footerStyle: (config.columns?.footerStyle as "default" | "grid" | undefined) ?? "default",
        pinnedPanelOpacity: config.pinnedPanelOpacity ?? 1,
      });
    });
  }, []);

  const buildPayload = (f: FormState) => ({
    staleSessionMinutes: Math.max(5, Math.min(480, f.staleMinutes || 30)),
    maxHeight: Math.max(300, Math.min(2400, f.maxHeight || 700)),
    theme: f.theme,
    notifications: f.notifications,
    notificationSound: f.notificationSound,
    pinnedPanelOpacity: f.pinnedPanelOpacity,
    columns: {
      gitBranch: f.gitBranch,
      changedFiles: f.changedFiles,
      subagents: f.subagents,
      lastAction: f.lastAction,
      compactPaths: f.compactPaths,
      cost: f.cost,
      doneFooter: f.doneFooter,
      footerStyle: f.footerStyle,
    },
  });

  // Toggle changes save immediately — no need to click Save for boolean settings
  const setAndSave = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    const next = { ...form, [key]: value };
    setForm(next);
    ipcRenderer.invoke("save-config", buildPayload(next)).catch(() => {});
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      await ipcRenderer.invoke("save-config", buildPayload(form));
      onSave();
    } catch (e: unknown) {
      setSaveError((e as Error)?.message ?? "Failed to save settings");
    }
  }, [form, onSave]);


  const ROW = "flex justify-between items-center py-1.75";
  const LABEL = "text-ui text-bright cursor-pointer";
  const DESC = "text-ui-sm text-faint mt-0.5";

  return (
    <div id="settings-panel" className="px-3 pt-2 pb-3">
      {/* Stale timeout */}
      <div className="flex justify-between items-start py-1.75">
        <div>
          <div className="text-ui text-bright">Stale session timeout</div>
          <div className={DESC}>
            Hide sessions with no activity after this long
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <input
            type="number"
            id="stale-minutes"
            min={5}
            max={480}
            value={form.staleMinutes}
            onChange={(e) =>
              set("staleMinutes", parseInt(e.target.value) || 30)
            }
            className="w-12 bg-edge border border-line text-bright text-ui text-center rounded px-1 py-0.5 no-spinners focus:outline-none focus:border-accent"
          />
          <span className="text-faint text-ui">min</span>
        </div>
      </div>

      {/* Max panel height */}
      <div className="flex justify-between items-start py-1.75">
        <div>
          <div className="text-ui text-bright">Max panel height</div>
          <div className={DESC}>
            Panel grows to this height before scrolling (px)
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <input
            type="number"
            id="max-height"
            min={300}
            max={2400}
            value={form.maxHeight}
            onChange={(e) => set("maxHeight", parseInt(e.target.value))}
            className="w-14 bg-edge border border-line text-bright text-ui text-center rounded px-1 py-0.5 no-spinners focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Theme */}
      <div className="flex justify-between items-center py-1.75">
        <div className="text-ui text-bright">Theme</div>
        <div className="flex rounded overflow-hidden border border-line shrink-0">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setAndSave("theme", t);
                onThemeChange(t);
              }}
              className={`px-3 py-0.5 text-ui-sm cursor-pointer border-none transition-colors duration-150 ${
                form.theme === t
                  ? "bg-accent text-base font-bold"
                  : "bg-edge text-soft hover:text-bright"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Pinned panel opacity */}
      <div className="flex justify-between items-center py-1.75">
        <div className="text-ui text-bright">Pinned panel opacity</div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((1 - form.pinnedPanelOpacity) * 100)}
            onChange={(e) =>
              setAndSave("pinnedPanelOpacity", 1 - parseInt(e.target.value) / 100)
            }
            className="w-24 cursor-pointer accent-accent"
          />
          <span className="text-faint text-ui-sm w-8 text-right">
            {Math.round((1 - form.pinnedPanelOpacity) * 100)}%
          </span>
        </div>
      </div>

      <hr className="border-line my-1" />

      <div className={ROW}>
        <label htmlFor="show-branch" className={LABEL}>
          Show git branch
        </label>
        <Toggle
          id="show-branch"
          checked={form.gitBranch}
          onChange={(v) => setAndSave("gitBranch", v)}
        />
      </div>
      <div className={ROW}>
        <label htmlFor="show-git-summary" className={LABEL}>
          Show git diff summary
        </label>
        <Toggle
          id="show-git-summary"
          checked={form.changedFiles}
          onChange={(v) => setAndSave("changedFiles", v)}
        />
      </div>
      <div className={ROW}>
        <label htmlFor="show-subagents" className={LABEL}>
          Show subagent info
        </label>
        <Toggle
          id="show-subagents"
          checked={form.subagents}
          onChange={(v) => setAndSave("subagents", v)}
        />
      </div>
      {/* Footer style */}
      <div className="flex justify-between items-center py-1.75">
        <div className="text-ui text-bright">Footer style</div>
        <div className="flex rounded overflow-hidden border border-line shrink-0">
          {(["default", "grid"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setAndSave("footerStyle", s)}
              className={`px-3 py-0.5 text-ui-sm cursor-pointer border-none transition-colors duration-150 ${
                form.footerStyle === s
                  ? "bg-accent text-base font-bold"
                  : "bg-edge text-soft hover:text-bright"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className={ROW}>
        <label htmlFor="show-model" className={LABEL}>
          Show model &amp; context
        </label>
        <Toggle
          id="show-model"
          checked={form.lastAction}
          onChange={(v) => setAndSave("lastAction", v)}
        />
      </div>
      <div className={ROW}>
        <label htmlFor="show-compact-paths" className={LABEL}>
          Compact paths
        </label>
        <Toggle
          id="show-compact-paths"
          checked={form.compactPaths}
          onChange={(v) => setAndSave("compactPaths", v)}
        />
      </div>
      <div className="flex justify-between items-start py-1.75">
        <div>
          <label htmlFor="show-cost" className={LABEL}>
            Show session cost
          </label>
          <div className={DESC}>
            API billing only — not available on Pro or Max subscriptions
          </div>
        </div>
        <Toggle
          id="show-cost"
          checked={form.cost}
          onChange={(v) => setAndSave("cost", v)}
        />
      </div>
      <div className={ROW}>
        <label htmlFor="show-done-footer" className={LABEL}>
          Show model &amp; context on done cards
        </label>
        <Toggle
          id="show-done-footer"
          checked={form.doneFooter}
          onChange={(v) => setAndSave("doneFooter", v)}
        />
      </div>

      <hr className="border-line my-1" />

      <div className={ROW}>
        <label htmlFor="show-notifications" className={LABEL}>
          Notifications
        </label>
        <Toggle
          id="show-notifications"
          checked={form.notifications}
          onChange={(v) => setAndSave("notifications", v)}
        />
      </div>
      <div className={ROW}>
        <label htmlFor="notification-sound" className={LABEL}>
          Sound alerts
        </label>
        <Toggle
          id="notification-sound"
          checked={form.notificationSound}
          onChange={(v) => setAndSave("notificationSound", v)}
        />
      </div>

      <hr className="border-line my-1" />

      {saveError && (
        <div className="text-ui-sm text-danger mt-1 mb-1">{saveError}</div>
      )}
      <button
        onClick={handleSave}
        className="w-full mt-1.5 py-1.5 bg-accent text-base text-ui font-bold rounded cursor-pointer border-none hover:opacity-90 transition-opacity duration-150"
      >
        Save
      </button>

      <hr className="border-line mt-3 mb-2" />

      {!confirmUninstall ? (
        <button
          onClick={() => setConfirmUninstall(true)}
          className="w-full py-1.5 bg-transparent text-dim text-ui-sm rounded cursor-pointer border border-line hover:border-danger hover:text-danger transition-colors duration-150"
        >
          Uninstall Claude Dashboard…
        </button>
      ) : (
        <div className="rounded border border-danger px-3 py-2.5">
          <div className="text-ui-sm text-danger mb-2">
            This will remove the hooks from{" "}
            <span className="font-mono">~/.claude/settings.json</span> and quit.
            Then drag Claude Dashboard from /Applications to the Trash.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => ipcRenderer.invoke("uninstall")}
              className="flex-1 py-1 bg-danger text-base text-ui-sm font-bold rounded cursor-pointer border-none hover:opacity-90 transition-opacity duration-150"
            >
              Confirm Uninstall
            </button>
            <button
              onClick={() => setConfirmUninstall(false)}
              className="flex-1 py-1 bg-transparent text-soft text-ui-sm rounded cursor-pointer border border-line hover:border-soft transition-colors duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* About footer — release version */}
      <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-end text-ui-sm">
        <span
          className="text-fainter font-mono tabular-nums"
          title="Release version"
        >
          {version ? `v${version}` : "—"}
        </span>
      </div>
    </div>
  );
}
