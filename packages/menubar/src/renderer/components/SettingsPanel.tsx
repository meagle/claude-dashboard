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
  doneFooter: boolean;
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
  cost: false,
  doneFooter: false,
  notifications: true,
  notificationSound: true,
};

function Toggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-8 h-4 bg-edge rounded-full transition-colors duration-200 peer-checked:bg-accent relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform after:duration-200 peer-checked:after:translate-x-4" />
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
        cost:         config.columns?.cost          ?? false,
        doneFooter:   config.columns?.doneFooter    ?? false,
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
        doneFooter:   form.doneFooter,
      },
    });
    onSave();
  };

  const ROW = 'flex justify-between items-center py-[7px]';
  const LABEL = 'text-[13px] text-bright cursor-pointer';
  const DESC = 'text-[12px] text-faint mt-0.5';

  return (
    <div id="settings-panel" className="px-3 pt-2 pb-3">
      {/* Stale timeout */}
      <div className="flex justify-between items-start py-[7px]">
        <div>
          <div className="text-[13px] text-bright">Stale session timeout</div>
          <div className={DESC}>Hide sessions with no activity after this long</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <input
            type="number"
            id="stale-minutes"
            min={5}
            max={480}
            value={form.staleMinutes}
            onChange={e => set('staleMinutes', parseInt(e.target.value) || 30)}
            className="w-12 bg-edge border border-line text-bright text-[13px] text-center rounded px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:border-accent"
          />
          <span className="text-faint text-[13px]">min</span>
        </div>
      </div>

      <hr className="border-line my-1" />

      <div className={ROW}>
        <label htmlFor="show-branch" className={LABEL}>Show git branch</label>
        <Toggle id="show-branch" checked={form.gitBranch} onChange={v => set('gitBranch', v)} />
      </div>
      <div className={ROW}>
        <label htmlFor="show-git-summary" className={LABEL}>Show git diff summary</label>
        <Toggle id="show-git-summary" checked={form.changedFiles} onChange={v => set('changedFiles', v)} />
      </div>
      <div className={ROW}>
        <label htmlFor="show-subagents" className={LABEL}>Show subagent info</label>
        <Toggle id="show-subagents" checked={form.subagents} onChange={v => set('subagents', v)} />
      </div>
      <div className={ROW}>
        <label htmlFor="show-model" className={LABEL}>Show model &amp; context</label>
        <Toggle id="show-model" checked={form.lastAction} onChange={v => set('lastAction', v)} />
      </div>
      <div className={ROW}>
        <label htmlFor="show-compact-paths" className={LABEL}>Compact paths</label>
        <Toggle id="show-compact-paths" checked={form.compactPaths} onChange={v => set('compactPaths', v)} />
      </div>
      <div className="flex justify-between items-start py-[7px]">
        <div>
          <label htmlFor="show-cost" className={LABEL}>Show session cost</label>
          <div className={DESC}>API billing only — not available on Pro or Max subscriptions</div>
        </div>
        <Toggle id="show-cost" checked={form.cost} onChange={v => set('cost', v)} />
      </div>
      <div className={ROW}>
        <label htmlFor="show-done-footer" className={LABEL}>Show model &amp; context on done cards</label>
        <Toggle id="show-done-footer" checked={form.doneFooter} onChange={v => set('doneFooter', v)} />
      </div>

      <hr className="border-line my-1" />

      <div className={ROW}>
        <label htmlFor="show-notifications" className={LABEL}>Notifications</label>
        <Toggle id="show-notifications" checked={form.notifications} onChange={v => set('notifications', v)} />
      </div>
      <div className={ROW}>
        <label htmlFor="notification-sound" className={LABEL}>Sound alerts</label>
        <Toggle id="notification-sound" checked={form.notificationSound} onChange={v => set('notificationSound', v)} />
      </div>

      <hr className="border-line my-1" />

      <button
        onClick={handleSave}
        className="w-full mt-1.5 py-1.5 bg-accent text-base text-[13px] font-bold rounded cursor-pointer border-none hover:opacity-90 transition-opacity duration-150"
      >
        Save
      </button>
    </div>
  );
}
