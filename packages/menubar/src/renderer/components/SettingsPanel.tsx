import React, { useState, useEffect, useCallback } from "react";
import { ipcRenderer, shell } from "../utils/electron";
import { DashboardConfig, ModelPricingEntry } from "../types";

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
  showBadgeCount: boolean;
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
  showBadgeCount: false,
  footerStyle: "default",
  pinnedPanelOpacity: 1,
};


type PricingRow = { prefix: string; source: 'fetched' | 'custom' } & ModelPricingEntry;

function buildRows(
  fetched: Record<string, ModelPricingEntry>,
  custom: Array<{ prefix: string } & ModelPricingEntry>,
): PricingRow[] {
  const rows: PricingRow[] = Object.entries(fetched).map(([prefix, p]) => ({
    prefix, source: 'fetched' as const, ...p,
  }));
  for (const c of custom) {
    const idx = rows.findIndex((r) => r.prefix === c.prefix);
    const row: PricingRow = { ...c, source: 'custom' };
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
  }
  return rows;
}

function isFieldOverridden(
  row: PricingRow,
  field: keyof ModelPricingEntry,
  fetchedPrices: Record<string, ModelPricingEntry>,
): boolean {
  if (row.source !== 'custom') return false;
  const base = fetchedPrices[row.prefix];
  if (!base) return true; // entirely custom model — all fields are custom
  return row[field] !== base[field];
}

const PRICE_FIELDS: Array<{ field: keyof ModelPricingEntry; label: string }> = [
  { field: 'input',      label: 'Input'       },
  { field: 'cacheWrite', label: 'Cache write' },
  { field: 'cacheRead',  label: 'Cache read'  },
  { field: 'output',     label: 'Output'      },
];

interface CostTabProps {
  showCost: boolean;
  onShowCostChange: (v: boolean) => void;
}

function CostTab({ showCost, onShowCostChange }: CostTabProps) {
  const [fetched, setFetched] = React.useState<Record<string, ModelPricingEntry>>({});
  const [custom, setCustom] = React.useState<Array<{ prefix: string } & ModelPricingEntry>>([]);
  const [fetchedAt, setFetchedAt] = React.useState<number | undefined>();
  const [editCell, setEditCell] = React.useState<{ prefix: string; field: keyof ModelPricingEntry } | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [showAdd, setShowAdd] = React.useState(false);
  const [addForm, setAddForm] = React.useState({ prefix: '', input: '', cacheWrite: '', cacheRead: '', output: '' });
  const [confirmReset, setConfirmReset] = React.useState(false);

  React.useEffect(() => {
    ipcRenderer.invoke('get-config').then((cfg: { modelPricing?: { fetched?: Record<string, ModelPricingEntry>; custom?: Array<{ prefix: string } & ModelPricingEntry>; fetchedAt?: number } }) => {
      setFetched(cfg.modelPricing?.fetched ?? {});
      setCustom(cfg.modelPricing?.custom ?? []);
      setFetchedAt(cfg.modelPricing?.fetchedAt);
    });
  }, []);

  const savePricing = (nextFetched: Record<string, ModelPricingEntry>, nextCustom: Array<{ prefix: string } & ModelPricingEntry>, nextFetchedAt?: number) => {
    setFetched(nextFetched);
    setCustom(nextCustom);
    ipcRenderer.invoke('save-config', {
      modelPricing: { fetched: nextFetched, custom: nextCustom, fetchedAt: nextFetchedAt ?? fetchedAt },
    }).catch(() => {});
  };

  const commitEdit = (row: PricingRow) => {
    if (!editCell) return;
    const numVal = parseFloat(editValue);
    if (isNaN(numVal) || numVal < 0) { setEditCell(null); return; }
    const base: ModelPricingEntry = {
      input: row.input, cacheWrite: row.cacheWrite, cacheRead: row.cacheRead, output: row.output,
      [editCell.field]: numVal,
    };
    const nextCustom = custom.filter((c) => c.prefix !== editCell.prefix);
    nextCustom.push({ prefix: editCell.prefix, ...base });
    savePricing(fetched, nextCustom);
    setEditCell(null);
  };

  const deleteCustom = (prefix: string) => {
    savePricing(fetched, custom.filter((c) => c.prefix !== prefix));
  };

  const handleAdd = () => {
    const { prefix, input, cacheWrite, cacheRead, output } = addForm;
    if (!prefix.trim()) return;
    const entry = {
      prefix: prefix.trim(),
      input: parseFloat(input) || 0,
      cacheWrite: parseFloat(cacheWrite) || 0,
      cacheRead: parseFloat(cacheRead) || 0,
      output: parseFloat(output) || 0,
    };
    const nextCustom = custom.filter((c) => c.prefix !== entry.prefix);
    nextCustom.push(entry);
    savePricing(fetched, nextCustom);
    setAddForm({ prefix: '', input: '', cacheWrite: '', cacheRead: '', output: '' });
    setShowAdd(false);
  };

  const rows = buildRows(fetched, custom);
  const lastUpdatedLabel = fetchedAt
    ? (() => {
        const diffMs = Date.now() - fetchedAt;
        const diffH = Math.floor(diffMs / 3_600_000);
        const diffM = Math.floor(diffMs / 60_000);
        if (diffH >= 1) return `${diffH}h ago`;
        if (diffM >= 1) return `${diffM}m ago`;
        return 'just now';
      })()
    : null;

  const CELL = 'text-ui-sm text-right text-faint px-1 py-1 border-b border-line/50';
  const HDR  = 'text-ui-sm text-fainter text-right px-1 pb-1 border-b border-line font-normal';
  const INPUT_CELL = 'w-14 bg-edge border border-accent text-bright text-ui text-right rounded px-1 py-0 no-spinners focus:outline-none';

  return (
    <div className="px-3 pt-2 pb-3">
      <div className="rounded border border-accent/20 bg-accent/5 px-2.5 py-2 text-ui-sm text-faint mb-3 leading-relaxed space-y-1">
        <div>Prices are fetched from <button onClick={() => shell.openExternal('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json')} className="font-mono text-[10px] text-accent underline underline-offset-2 bg-transparent border-none cursor-pointer p-0 hover:opacity-70 transition-opacity break-all">raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json</button>, a community-maintained list of API list prices. All values are <span className="text-body">per million tokens</span>.</div>
        <div><span className="text-body">Click any price to edit it.</span> Edited values are saved as custom overrides — marked with an <span className="text-[#d97706]">●</span> orange dot and always take priority over fetched prices. Use <span className="text-body">Reset overrides</span> to clear them and restore fetched prices.</div>
      </div>

      <div className="flex justify-between items-center mb-1.5">
        <span className="text-ui-sm text-fainter uppercase tracking-wide">Model Pricing</span>
        <span className="text-ui-sm text-fainter flex items-center gap-2">
          {lastUpdatedLabel && <span>Updated {lastUpdatedLabel}</span>}
          {custom.length > 0 && (
            confirmReset ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[#d97706]">Clear all overrides?</span>
                <button
                  onClick={() => { savePricing(fetched, []); setConfirmReset(false); }}
                  className="text-bright bg-transparent border-none cursor-pointer text-ui-sm p-0 hover:opacity-70 transition-opacity font-semibold"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="text-soft bg-transparent border-none cursor-pointer text-ui-sm p-0 hover:opacity-70 transition-opacity"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="text-[#d97706] bg-transparent border-none cursor-pointer text-ui-sm p-0 hover:opacity-70 transition-opacity"
              >
                Reset overrides
              </button>
            )
          )}
        </span>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-ui-sm text-fainter px-1 pb-1 border-b border-line font-normal">Prefix</th>
            {PRICE_FIELDS.map(({ label }) => (
              <th key={label} className={HDR}>{label}</th>
            ))}
            <th className={HDR}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.prefix} className="group">
              <td className="text-ui-sm text-left px-1 py-1 border-b border-line/50">
                <span className={`font-mono text-[10px] px-1 py-0.5 rounded ${row.source === 'custom' ? 'bg-tool/10 text-tool' : 'bg-model-bg text-accent'}`}>
                  {row.prefix}
                </span>
              </td>
              {PRICE_FIELDS.map(({ field }) => (
                <td key={field} className={CELL}>
                  {editCell?.prefix === row.prefix && editCell?.field === field ? (
                    <input
                      type="number"
                      autoFocus
                      className={INPUT_CELL}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(row)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(row); if (e.key === 'Escape') setEditCell(null); }}
                    />
                  ) : (
                    <span
                      className="cursor-pointer hover:text-bright transition-colors inline-flex items-center gap-1 justify-end w-full"
                      onClick={() => { setEditCell({ prefix: row.prefix, field }); setEditValue(String(row[field])); }}
                    >
                      ${row[field]}
                      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isFieldOverridden(row, field, fetched) ? 'bg-[#d97706]' : 'opacity-0'}`} />
                    </span>
                  )}
                </td>
              ))}
              <td className={`${CELL} w-5`}>
                {row.source === 'custom' && (
                  <button
                    onClick={() => deleteCustom(row.prefix)}
                    className="text-fainter hover:text-danger bg-transparent border-none cursor-pointer text-sm leading-none p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {custom.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5 text-ui-sm text-fainter">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#d97706] flex-shrink-0" />
          <span>Overridden value — takes priority over the fetched price</span>
        </div>
      )}

      {showAdd ? (
        <div className="mt-2 border border-line rounded p-2.5 bg-surface">
          <div className="text-ui-sm text-bright font-semibold mb-2">Add custom model</div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <div className="col-span-2">
              <div className="text-ui-sm text-fainter uppercase tracking-wide mb-0.5">Model prefix</div>
              <input
                type="text"
                placeholder="e.g. my-proxy-model"
                value={addForm.prefix}
                onChange={(e) => setAddForm((f) => ({ ...f, prefix: e.target.value }))}
                className="w-full bg-edge border border-line text-bright text-ui rounded px-1.5 py-0.5 focus:outline-none focus:border-accent font-mono"
              />
            </div>
            {(['input', 'output', 'cacheWrite', 'cacheRead'] as const).map((f) => (
              <div key={f}>
                <div className="text-ui-sm text-fainter uppercase tracking-wide mb-0.5">
                  {f === 'input' ? 'Input $/M' : f === 'output' ? 'Output $/M' : f === 'cacheWrite' ? 'Cache write $/M' : 'Cache read $/M'}
                </div>
                <input
                  type="number"
                  placeholder="0.00"
                  value={addForm[f]}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, [f]: e.target.value }))}
                  className="w-full bg-edge border border-line text-bright text-ui rounded px-1.5 py-0.5 no-spinners focus:outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setShowAdd(false)} className="px-2.5 py-0.5 text-ui-sm text-soft bg-transparent border border-line rounded cursor-pointer hover:border-soft transition-colors">
              Cancel
            </button>
            <button onClick={handleAdd} disabled={!addForm.prefix.trim()} className="px-2.5 py-0.5 text-ui-sm font-bold text-base bg-accent rounded border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40">
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full mt-2 py-1.5 text-ui-sm text-accent bg-transparent border border-dashed border-accent/30 rounded cursor-pointer hover:bg-accent/5 hover:border-accent/50 transition-colors flex items-center justify-center gap-1"
        >
          + Add custom model
        </button>
      )}

      <hr className="border-line my-2" />

      <div className="flex justify-between items-start py-1.75">
        <div>
          <label htmlFor="show-cost" className="text-ui text-bright cursor-pointer">
            Show session cost
          </label>
          <div className="text-ui-sm text-faint mt-0.5">
            API billing only — not available on Pro or Max subscriptions
          </div>
        </div>
        <Toggle id="show-cost" checked={showCost} onChange={onShowCostChange} />
      </div>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState<'general' | 'cost'>('general');

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
        showBadgeCount: config.showBadgeCount ?? false,
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
    showBadgeCount: f.showBadgeCount,
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
    <div id="settings-panel">
      <div className="flex border-b border-line">
        {(['general', 'cost'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-ui-sm border-none cursor-pointer bg-transparent border-b-2 -mb-px transition-colors duration-150 ${
              activeTab === tab
                ? 'text-accent border-accent'
                : 'text-soft border-transparent hover:text-bright'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      {activeTab === 'cost' && (
        <CostTab
          showCost={form.cost}
          onShowCostChange={(v) => setAndSave('cost', v)}
        />
      )}
      {activeTab === 'general' && <div className="px-3 pt-2 pb-3">
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
      <div className={ROW}>
        <label htmlFor="show-badge-count" className={LABEL}>
          Show agent count in menu bar
        </label>
        <Toggle
          id="show-badge-count"
          checked={form.showBadgeCount}
          onChange={(v) => setAndSave("showBadgeCount", v)}
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
    </div>}
    </div>
  );
}
