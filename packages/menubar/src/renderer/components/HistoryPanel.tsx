import React, { useEffect, useMemo, useState } from "react";
import { ipcRenderer, clipboard } from "../utils/electron";
import { HistoryRow } from "../types";
import { compactPath, formatTokens } from "../utils/format";
import { COPY_ICON } from "./icons";

/* ─── Inline icons matching the SessionCard SVG vocabulary ─────────────── */

const TURN_ICON = (
  <svg
    viewBox="0 0 16 16"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M2 8a6 6 0 1 1 1.76 4.24" />
    <path d="M2 13v-3h3" />
  </svg>
);

const TOOL_ICON = (
  <svg
    viewBox="0 0 16 16"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M9.5 2.5a3 3 0 0 1 3.9 3.9l-7.4 7.4-2.6.6.6-2.6 7.4-7.4z" />
    <path d="M11 4l1 1" />
  </svg>
);

const SEARCH_ICON = (
  <svg
    viewBox="0 0 16 16"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="7" cy="7" r="5" />
    <path d="M11 11l3 3" />
  </svg>
);

const CARET_DOWN = (
  <svg
    viewBox="0 0 12 12"
    width="9"
    height="9"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 4.5l3 3 3-3" />
  </svg>
);

const CHEVRON = (
  <svg
    viewBox="0 0 12 12"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M4 3l3 3-3 3" />
  </svg>
);

/* ─── Formatters ───────────────────────────────────────────────────────── */

function formatTurns(turns: number | null): string | null {
  if (turns == null || turns <= 0) return null;
  return turns === 1 ? "1 turn" : `${turns} turns`;
}

function formatCost(costUsd: number | null): string | null {
  if (costUsd == null) return null;
  return `$${costUsd.toFixed(2)}`;
}

function formatTools(toolCount: number): string | null {
  return toolCount > 0 ? `${toolCount} tools` : null;
}

function dayLabel(date: Date, today: Date): string {
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === todayStr) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function shortModel(model: string | null): string | null {
  if (!model) return null;
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("opus")) return "Opus";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-").slice(0, 2).join(" ");
}

/* ─── Time-range filter ────────────────────────────────────────────────── */

type RangeKey = "today" | "week" | "month" | "all";

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "All time",
};

function rangeFloor(key: RangeKey): number {
  const now = new Date();
  if (key === "all") return 0;
  if (key === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (key === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.getTime();
  }
  // month
  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return d.getTime();
}

/* ─── Day grouping ─────────────────────────────────────────────────────── */

interface DayGroup {
  label: string;
  sessions: HistoryRow[];
  totalCost: number | null;
  totalTokens: number | null;
}

function groupByDay(sessions: HistoryRow[], showCost: boolean): DayGroup[] {
  const today = new Date();
  const sorted = [...sessions].sort((a, b) => b.lastActivity - a.lastActivity);
  const map = new Map<string, HistoryRow[]>();
  for (const s of sorted) {
    const date = new Date(s.lastActivity);
    const key = date.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([key, rows]) => {
    const hasCost = showCost && rows.some((r) => r.costUsd != null);
    const total = hasCost
      ? rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
      : null;
    const totalTok =
      rows.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0) || null;
    return {
      label: dayLabel(new Date(key), today),
      sessions: rows,
      totalCost: total,
      totalTokens: totalTok,
    };
  });
}

/* ─── Pill primitives — match SessionCard / Header pill chrome ─────────── */

function MetaPill({
  icon,
  children,
  accent = false,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  accent?: boolean;
}) {
  const cls = accent
    ? "bg-tool/15 border-tool/40 text-tool"
    : "bg-line/40 border-edge/60 text-soft";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-badge border ${cls} text-[11px] font-mono leading-none whitespace-nowrap`}
    >
      {icon && (
        <span className="inline-flex items-center text-fainter">{icon}</span>
      )}
      <span className="tabular-nums">{children}</span>
    </span>
  );
}

/* ─── Day-group header (#4) ─────────────────────────────────────────────
 * Larger day label, right-aligned summary pills, cyan→violet gradient rule.
 * Replaces the plain hairline-underlined row.
 * ────────────────────────────────────────────────────────────────────── */

function DayGroupHeader({
  label,
  count,
  totalCost,
  totalTokens,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  totalCost: number | null;
  totalTokens: number | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="px-1 mb-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2 mb-1 group/dh text-left"
      >
        <span
          className={`shrink-0 inline-flex text-fainter group-hover/dh:text-soft transition-transform duration-150 ${
            collapsed ? "" : "rotate-90"
          }`}
        >
          {CHEVRON}
        </span>
        <span className="text-[15px] font-bold text-brighter tracking-tight group-hover/dh:text-bright transition-colors">
          {label}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <MetaPill>
            {count} session{count === 1 ? "" : "s"}
          </MetaPill>
          {totalTokens != null && (
            <MetaPill>{formatTokens(totalTokens)}</MetaPill>
          )}
          {totalCost != null && (
            <MetaPill accent>{formatCost(totalCost)}</MetaPill>
          )}
        </span>
      </button>
      <div
        className="h-[2px] rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-accent) 0%, var(--color-tool) 50%, transparent 100%)",
          opacity: 0.3,
        }}
      />
    </div>
  );
}

/* ─── Path: leaf-anchored truncation (#5) ────────────────────────────────
 * Standard `text-overflow: ellipsis` clips the rightmost characters, hiding
 * the leaf folder — the most identifying segment. Setting `direction: rtl`
 * on the wrapper flips the truncation side; we restore LTR rendering on
 * the inner span and bidi-isolate so the actual characters read normally.
 * ────────────────────────────────────────────────────────────────────── */

function LeafPath({ pathStr, copied }: { pathStr: string; copied: boolean }) {
  return (
    <span
      className={`overflow-hidden text-ellipsis whitespace-nowrap min-w-0 font-mono text-sm ${
        copied ? "text-accent" : "text-fainter group-hover/path:text-soft"
      }`}
      style={{ direction: "rtl" }}
    >
      <bdi style={{ direction: "ltr", unicodeBidi: "bidi-override" }}>
        {copied ? "copied!" : pathStr}
      </bdi>
    </span>
  );
}

/* ─── Entry (#5 layout — quote rule) ────────────────────────────────────── */

interface HistoryEntryProps {
  s: HistoryRow;
  showCost: boolean;
  home: string;
}

function HistoryEntry({ s, showCost, home }: HistoryEntryProps) {
  const [pathCopied, setPathCopied] = useState(false);

  const turns = formatTurns(s.turns);
  const tools = formatTools(s.toolCount);
  const cost = showCost ? formatCost(s.costUsd) : null;
  const tokens = showCost ? formatTokens(s.totalTokens) : null;
  const model = shortModel(s.model);
  const prompt = s.currentTask ?? s.lastPrompt;
  const answer = s.lastMessage
    ? s.lastMessage.length > 160
      ? s.lastMessage.slice(0, 160) + "…"
      : s.lastMessage
    : null;
  const pathStr = compactPath(s.workingDir, home);

  const errored = !!s.errorState;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    clipboard.writeText(s.workingDir);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  };

  return (
    <div className="group relative overflow-hidden rounded-lg border border-line/80 bg-surface/70 backdrop-blur-sm hover:bg-surface hover:border-edge transition-all duration-150 px-3 pt-2.5 pb-2.5">
      {/* Muted left accent stripe */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 bottom-0 w-[2px] ${
          errored
            ? "bg-badge-loop/50"
            : "bg-fainter/30 group-hover:bg-fainter/60"
        } transition-colors duration-150`}
      />

      {/* Row 1: dir name + metadata pills (right-aligned) */}
      <div className="flex items-center gap-2 mb-1.5 leading-card flex-wrap">
        <span className="font-bold text-bright text-ui">{s.dirName}</span>
        <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
          {turns && <MetaPill icon={TURN_ICON}>{turns}</MetaPill>}
          {tools && <MetaPill icon={TOOL_ICON}>{tools}</MetaPill>}
          {tokens && <MetaPill>{tokens}</MetaPill>}
          {cost && <MetaPill>{cost}</MetaPill>}
          {model && <MetaPill accent>{model}</MetaPill>}
        </span>
      </div>

      {/* Row 2: path — leaf-anchored truncation, click to copy */}
      <div
        className="flex items-center min-w-0 mb-2 cursor-pointer group/path"
        title="Click to copy full path"
        onClick={handleCopyPath}
      >
        <LeafPath pathStr={pathStr} copied={pathCopied} />
        <span className="shrink-0 text-fainter px-1.5 inline-flex items-center leading-none transition-colors duration-150 group-hover/path:text-accent">
          {COPY_ICON}
        </span>
      </div>

      {/* Row 3: prompt + answer in a quoted panel — matches SessionCard's bg-base/60 inner panel and ↳ indentation */}
      {(prompt || answer) && (
        <div className="rounded-md bg-base/60 border border-line/60 px-2.5 py-2">
          {prompt && (
            <div className="flex items-start gap-1.5 text-sm text-prompt leading-card break-words">
              <span className="shrink-0 text-fainter leading-none text-base font-bold mt-px">
                ›
              </span>
              <span className="min-w-0">{prompt}</span>
            </div>
          )}
          {answer ? (
            <div className="mt-1 pl-4 text-sm text-soft break-words leading-card">
              <span className="text-fainter mr-1">↳</span>
              {answer}
            </div>
          ) : prompt ? (
            <div className="mt-1 pl-4 flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block w-[6px] h-[6px] rounded-full bg-badge-done shrink-0"
              />
              <span className="text-soft font-mono text-[11px]">Completed</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ─── Filter bar (#7) ────────────────────────────────────────────────────
 * Single-line input + range dropdown. Uses the same dark-surface chrome as
 * the panel and the same pill-shape range selector as elsewhere.
 * ────────────────────────────────────────────────────────────────────── */

function FilterBar({
  query,
  onQuery,
  range,
  onRange,
  total,
  filtered,
}: {
  query: string;
  onQuery: (v: string) => void;
  range: RangeKey;
  onRange: (k: RangeKey) => void;
  total: number;
  filtered: number;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  return (
    <div className="px-2 pt-1.5 pb-2 border-b border-line/60 flex items-center gap-2 shrink-0">
      {/* Search input */}
      <label className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface/80 border border-edge/60 focus-within:border-accent/60 transition-colors">
        <span className="text-fainter shrink-0 inline-flex">{SEARCH_ICON}</span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter projects, prompts…"
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-bright text-[12px] font-mono placeholder:text-fainter/70"
          aria-label="Filter history"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            className="text-fainter hover:text-bright text-[11px] px-1 leading-none transition-colors"
            title="Clear filter"
          >
            ×
          </button>
        )}
      </label>

      {/* Range dropdown */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setRangeOpen((v) => !v)}
          onBlur={() => setTimeout(() => setRangeOpen(false), 120)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface/80 border border-edge/60 hover:border-edge text-soft text-[11px] font-mono leading-none transition-colors"
          title="Time range"
        >
          <span>{RANGE_LABELS[range]}</span>
          <span className="text-fainter">{CARET_DOWN}</span>
        </button>
        {rangeOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-10 min-w-[120px] rounded-md bg-surface border border-edge shadow-lg overflow-hidden"
            role="menu"
          >
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onRange(k);
                  setRangeOpen(false);
                }}
                className={`block w-full text-left px-2.5 py-1.5 text-[11px] font-mono leading-none transition-colors ${
                  k === range
                    ? "bg-line/80 text-bright"
                    : "text-soft hover:bg-line/50 hover:text-bright"
                }`}
                role="menuitem"
              >
                {RANGE_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result count */}
      <span className="shrink-0 text-fainter text-[11px] font-mono tabular-nums whitespace-nowrap">
        {filtered === total ? `${total}` : `${filtered}/${total}`}
      </span>
    </div>
  );
}

/* ─── Panel ────────────────────────────────────────────────────────────── */

interface HistoryPanelProps {
  showCost: boolean;
  home: string;
}

const COLLAPSE_STORAGE_KEY = "history-panel:expanded-groups";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function HistoryPanel({ showCost, home }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("all");

  // Persisted set of *user-expanded* group labels. Default = all collapsed.
  // When a search is active, every matching group expands automatically and
  // this set is ignored for display (but preserved so collapse state returns
  // when the search is cleared).
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded());

  const toggleGroup = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      saveExpanded(next);
      return next;
    });
  };

  const searching = query.trim().length > 0;

  useEffect(() => {
    ipcRenderer.invoke("get-history").then((rows: HistoryRow[]) => {
      setHistory(rows ?? []);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!history) return [];
    const floor = rangeFloor(range);
    const q = query.trim().toLowerCase();
    return history.filter((r) => {
      if (r.lastActivity < floor) return false;
      if (!q) return true;
      const hay = [
        r.dirName,
        r.workingDir,
        r.lastPrompt,
        r.currentTask,
        r.lastMessage,
        r.branch,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [history, query, range]);

  if (history === null) {
    return (
      <div id="history-panel" className="px-3 py-4 text-soft text-sm">
        Loading…
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div
        id="history-panel"
        className="px-3 py-4 text-soft text-sm leading-relaxed"
      >
        No history yet — completed sessions appear here after they expire from
        the dashboard.
      </div>
    );
  }

  const groups = groupByDay(filtered, showCost);

  return (
    <div id="history-panel" className="flex flex-col flex-1 min-h-0">
      <FilterBar
        query={query}
        onQuery={setQuery}
        range={range}
        onRange={setRange}
        total={history.length}
        filtered={filtered.length}
      />

      <div className="flex flex-col gap-4 px-2 py-2 overflow-y-auto flex-1 min-h-0">
        {groups.length === 0 ? (
          <div className="px-2 py-6 text-fainter text-sm text-center font-mono">
            No matches for{" "}
            {query ? `"${query}"` : RANGE_LABELS[range].toLowerCase()}
          </div>
        ) : (
          groups.map((group, i) => {
            // Auto-expand on search; otherwise honor the persisted user state.
            const isOpen = searching || expanded.has(group.label);
            return (
              <div key={group.label} className={i > 0 ? "mt-2" : ""}>
                <DayGroupHeader
                  label={group.label}
                  count={group.sessions.length}
                  totalCost={group.totalCost}
                  totalTokens={group.totalTokens}
                  collapsed={!isOpen}
                  onToggle={() => toggleGroup(group.label)}
                />
                {isOpen && (
                  <div className="flex flex-col gap-1.5">
                    {group.sessions.map((s) => (
                      <HistoryEntry
                        key={s.sessionId}
                        s={s}
                        showCost={showCost}
                        home={home}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
