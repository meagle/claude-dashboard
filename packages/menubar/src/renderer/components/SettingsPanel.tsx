import React, { useState, useEffect } from 'react';
import { ipcRenderer } from '../utils/electron';
import { DashboardConfig } from '../types';

interface SettingsPanelProps {
  onSave: () => void;
  onCancel: () => void;
}

interface FormState {
  staleMinutes: number;
  gitBranch: boolean;
  changedFiles: boolean;
  subagents: boolean;
  lastAction: boolean;
  compactPaths: boolean;
  cost: boolean;
  notifications: boolean;
  notificationSound: boolean;
}

const DEFAULTS: FormState = {
  staleMinutes: 30,
  gitBranch: true,
  changedFiles: true,
  subagents: true,
  lastAction: true,
  compactPaths: true,
  cost: true,
  notifications: true,
  notificationSound: true,
};

function Toggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

export function SettingsPanel({ onSave, onCancel }: SettingsPanelProps) {
  const [form, setForm] = useState<FormState>(DEFAULTS);

  useEffect(() => {
    ipcRenderer.invoke('get-config').then((config: DashboardConfig) => {
      setForm({
        staleMinutes: config.staleSessionMinutes ?? 30,
        gitBranch:    config.columns?.gitBranch    ?? true,
        changedFiles: config.columns?.changedFiles  ?? true,
        subagents:    config.columns?.subagents     ?? true,
        lastAction:   config.columns?.lastAction    ?? true,
        compactPaths: config.columns?.compactPaths  ?? true,
        cost:         config.columns?.cost          ?? true,
        notifications:     config.notifications      ?? true,
        notificationSound: config.notificationSound  ?? true,
      });
    });
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const minutes = Math.max(5, Math.min(480, form.staleMinutes || 30));
    await ipcRenderer.invoke('save-config', {
      staleSessionMinutes: minutes,
      notifications:      form.notifications,
      notificationSound:  form.notificationSound,
      columns: {
        gitBranch:    form.gitBranch,
        changedFiles: form.changedFiles,
        subagents:    form.subagents,
        lastAction:   form.lastAction,
        compactPaths: form.compactPaths,
        cost:         form.cost,
      },
    });
    onSave();
  };

  return (
    <div id="settings-panel" className="open">
      <div className="setting-row">
        <div>
          <div className="setting-label">Stale session timeout</div>
          <div className="setting-desc">Hide sessions with no activity after this long</div>
        </div>
        <div className="setting-control">
          <input
            type="number"
            id="stale-minutes"
            min={5}
            max={480}
            value={form.staleMinutes}
            onChange={e => set('staleMinutes', parseInt(e.target.value) || 30)}
          />
          <span className="setting-unit">min</span>
        </div>
      </div>
      <hr className="setting-divider" />
      <div className="setting-row">
        <label className="setting-toggle" htmlFor="show-branch">
          <span className="setting-label">Show git branch</span>
        </label>
        <Toggle id="show-branch" checked={form.gitBranch} onChange={v => set('gitBranch', v)} />
      </div>
      <div className="setting-row">
        <label className="setting-toggle" htmlFor="show-git-summary">
          <span className="setting-label">Show git diff summary</span>
        </label>
        <Toggle id="show-git-summary" checked={form.changedFiles} onChange={v => set('changedFiles', v)} />
      </div>
      <div className="setting-row">
        <label className="setting-toggle" htmlFor="show-subagents">
          <span className="setting-label">Show subagent info</span>
        </label>
        <Toggle id="show-subagents" checked={form.subagents} onChange={v => set('subagents', v)} />
      </div>
      <div className="setting-row">
        <label className="setting-toggle" htmlFor="show-model">
          <span className="setting-label">Show model &amp; context</span>
        </label>
        <Toggle id="show-model" checked={form.lastAction} onChange={v => set('lastAction', v)} />
      </div>
      <div className="setting-row">
        <label className="setting-toggle" htmlFor="show-compact-paths">
          <span className="setting-label">Compact paths</span>
        </label>
        <Toggle id="show-compact-paths" checked={form.compactPaths} onChange={v => set('compactPaths', v)} />
      </div>
      <div className="setting-row">
        <div>
          <label className="setting-toggle" htmlFor="show-cost">
            <span className="setting-label">Show session cost</span>
          </label>
          <div className="setting-desc">API billing only — not available on Pro or Max subscriptions</div>
        </div>
        <Toggle id="show-cost" checked={form.cost} onChange={v => set('cost', v)} />
      </div>
      <hr className="setting-divider" />
      <div className="setting-row">
        <label className="setting-toggle" htmlFor="show-notifications">
          <span className="setting-label">Notifications</span>
        </label>
        <Toggle id="show-notifications" checked={form.notifications} onChange={v => set('notifications', v)} />
      </div>
      <div className="setting-row">
        <label className="setting-toggle" htmlFor="notification-sound">
          <span className="setting-label">Sound alerts</span>
        </label>
        <Toggle id="notification-sound" checked={form.notificationSound} onChange={v => set('notificationSound', v)} />
      </div>
      <hr className="setting-divider" />
      <button id="save-settings" onClick={handleSave}>Save</button>
    </div>
  );
}
