import React from 'react';
import { SessionRow } from '../types';

export type ViewMode = 'card' | 'compact' | 'oneline';

/* ─── Brand mark ──────────────────────────────────────────────────────────
 * A compact "orbit" mark that echoes the cyan→violet gradient used on
 * context bars, session-key pills, and status dots. Replaces the 🤖 emoji.
 *
 *    ╭─╮           outer ring (cyan → violet gradient stroke)
 *    │ · │         inner nucleus dot (accent)
 *    ╰─╯
 *
 * When any session is actively running we add a soft pulsing ring behind
 * the mark — mirrors the `animate-status-pulse` used across SessionCard.
 * ────────────────────────────────────────────────────────────────────── */
function BrandMark({ pulse }: { pulse: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center w-[18px] h-[18px] shrink-0">
      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full animate-status-pulse"
          style={{
            background:
              'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
            opacity: 0.35,
          }}
        />
      )}
      <svg
        viewBox="0 0 18 18"
        width="18"
        height="18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="claude-mark-grad" x1="0" y1="0" x2="18" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-tool)" />
          </linearGradient>
        </defs>
        {/* Outer ring */}
        <circle cx="9" cy="9" r="7" stroke="url(#claude-mark-grad)" strokeWidth="1.5" />
        {/* Orbit tick (top-right) – a subtle "active" cue */}
        <circle cx="14.2" cy="4.2" r="1.4" fill="url(#claude-mark-grad)" />
        {/* Nucleus */}
        <circle cx="9" cy="9" r="2" fill="url(#claude-mark-grad)" />
      </svg>
    </span>
  );
}

/* ─── Status icons ──────────────────────────────────────────────────────── */

const CLOCK_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
  </svg>
);

const HOME_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6-.707.707L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.063-.354-6-6zM8 2.707l5 5V13.5a.5.5 0 0 1-.5.5H10v-4a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v4H3.5a.5.5 0 0 1-.5-.5V7.707l5-5z"/>
  </svg>
);

const PIN_FILLED_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
  </svg>
);

const PIN_OUTLINE_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
  </svg>
);

const GEAR_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
  </svg>
);

const CLOSE_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
  </svg>
);

const POPOUT_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 1h5a.5.5 0 0 0 0-1h-5A1.5 1.5 0 0 0 0 1.5v12A1.5 1.5 0 0 0 1.5 15h12a1.5 1.5 0 0 0 1.5-1.5v-5a.5.5 0 0 0-1 0v5a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z"/>
    <path d="M9.5 0a.5.5 0 0 0 0 1h4.293L5.146 9.646a.5.5 0 0 0 .708.708L14.5 1.707V6a.5.5 0 0 0 1 0V.5a.5.5 0 0 0-.5-.5H9.5z"/>
  </svg>
);

const LIST_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
  </svg>
);

const CARD_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-11A1.5 1.5 0 0 1 1 5.5v-3zm1 0v3a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-11a.5.5 0 0 0-.5.5zm-1 7A1.5 1.5 0 0 1 2.5 8h11A1.5 1.5 0 0 1 15 9.5v3A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-3zm1 0v3a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-11a.5.5 0 0 0-.5.5z"/>
  </svg>
);

// Compact view: pairs of lines (2-line rows)
const COMPACT_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2" width="14" height="1.5" rx="0.5"/>
    <rect x="1" y="5" width="9"  height="1.5" rx="0.5"/>
    <rect x="1" y="9" width="14" height="1.5" rx="0.5"/>
    <rect x="1" y="12" width="9"  height="1.5" rx="0.5"/>
  </svg>
);

// One-line view: evenly-spaced single lines
const ONELINE_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2.5"  width="14" height="1.5" rx="0.5"/>
    <rect x="1" y="6.25" width="14" height="1.5" rx="0.5"/>
    <rect x="1" y="10"   width="14" height="1.5" rx="0.5"/>
    <rect x="1" y="13.5" width="14" height="1.5" rx="0.5"/>
  </svg>
);

// Map: current mode → { next-mode icon, tooltip }
const VIEW_CYCLE: Record<ViewMode, { icon: React.ReactNode; title: string }> = {
  card:    { icon: COMPACT_ICON,  title: 'Switch to compact view'  },
  compact: { icon: ONELINE_ICON,  title: 'Switch to one-line view' },
  oneline: { icon: CARD_ICON,     title: 'Switch to card view'     },
};

const BTN = 'bg-transparent border-none cursor-pointer text-soft text-base px-0.5 leading-none transition-colors duration-150 focus:outline-none';

/* ─── Live activity pills ───────────────────────────────────────────────── */

interface Counts {
  active: number;
  waiting: number;
  error: number;
  done: number;
  total: number;
}

function computeCounts(sessions: SessionRow[] | undefined): Counts {
  const c: Counts = { active: 0, waiting: 0, error: 0, done: 0, total: 0 };
  if (!sessions) return c;
  for (const s of sessions) {
    c.total++;
    if (s.errorState) c.error++;
    else if (s.status === 'active') c.active++;
    else if (s.status === 'waiting_permission' || s.status === 'waiting_input') c.waiting++;
    else if (s.status === 'done') c.done++;
  }
  return c;
}

function StatusPill({
  count, label, colorClass, pulse = false, title,
}: {
  count: number;
  label: string;
  colorClass: string;
  pulse?: boolean;
  title: string;
}) {
  if (count === 0) return null;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-badge bg-line/40 border border-edge/60 text-[11px] leading-none ${colorClass}`}
    >
      <span
        className={`inline-block w-[6px] h-[6px] rounded-full bg-current ${pulse ? 'animate-status-pulse' : ''}`}
        aria-hidden
      />
      <span className="font-mono tabular-nums font-bold">{count}</span>
      <span className="text-fainter">{label}</span>
    </span>
  );
}

/* ─── Header ────────────────────────────────────────────────────────────── */

interface HeaderProps {
  isDetached: boolean;
  isSettingsOpen: boolean;
  isHistoryOpen: boolean;
  viewMode: ViewMode;
  alwaysOnTop: boolean;
  onSettingsToggle: () => void;
  onHistoryToggle: () => void;
  onViewModeChange: () => void;
  onPopout: () => void;
  onPinToggle: () => void;
  onClose: () => void;
  /** Optional — when provided, header shows live activity pills. */
  sessions?: SessionRow[];
}

export function Header({
  isDetached,
  isSettingsOpen,
  isHistoryOpen,
  viewMode,
  alwaysOnTop,
  onSettingsToggle,
  onHistoryToggle,
  onViewModeChange,
  onPopout,
  onPinToggle,
  onClose,
  sessions,
}: HeaderProps) {
  const counts = computeCounts(sessions);
  const anyRunning = counts.active + counts.waiting > 0;
  const cycle = VIEW_CYCLE[viewMode];
  const isNonCard = viewMode !== 'card';

  return (
    <div
      id="header"
      className="flex justify-between items-center px-3 pb-1.5 border-b border-line shrink-0 gap-2"
    >
      {/* ── Left: brand mark + wordmark + live activity pills ─────────── */}
      <span className="flex items-center gap-2 min-w-0">
        <BrandMark pulse={anyRunning} />
        <span className="font-bold text-bright text-[13px] tracking-tight">Claude</span>

        {counts.total > 0 && !isHistoryOpen && !isSettingsOpen && (
          <span className="flex items-center gap-1 ml-1">
            <span className="text-fainter/70 text-xs">·</span>
            <StatusPill
              count={counts.active}
              label="active"
              colorClass="text-badge-active"
              pulse
              title={`${counts.active} active session${counts.active === 1 ? '' : 's'}`}
            />
            <StatusPill
              count={counts.waiting}
              label="waiting"
              colorClass="text-badge-waiting"
              pulse
              title={`${counts.waiting} waiting on input or permission`}
            />
            <StatusPill
              count={counts.error}
              label="loop"
              colorClass="text-badge-loop"
              title={`${counts.error} session${counts.error === 1 ? '' : 's'} in a loop`}
            />
          </span>
        )}
      </span>

      {/* ── Right: functional controls (unchanged) ────────────────────── */}
      <span className="flex items-center gap-2.5 shrink-0">
        {!isDetached && (
          <button
            title="Open as standalone panel"
            className={`${BTN} hover:text-bright`}
            onClick={onPopout}
          >
            {POPOUT_ICON}
          </button>
        )}
        <button
          title={cycle.title}
          className={`${BTN} ${isNonCard ? 'text-accent' : 'hover:text-bright'}`}
          onClick={onViewModeChange}
        >
          {cycle.icon}
        </button>
        <button
          title={isHistoryOpen ? 'Back to sessions' : 'Session history'}
          className={`${BTN} ${isHistoryOpen ? 'text-accent' : 'hover:text-bright'}`}
          onClick={onHistoryToggle}
        >
          {isHistoryOpen ? HOME_ICON : CLOCK_ICON}
        </button>
        <button
          title="Settings"
          className={`${BTN} ${isSettingsOpen ? 'text-accent' : 'hover:text-bright'}`}
          onClick={onSettingsToggle}
        >
          {GEAR_ICON}
        </button>
        {isDetached && (
          <span className="flex items-center gap-2">
            <button
              title={alwaysOnTop ? 'Always on top (click to disable)' : 'Always on top (click to enable)'}
              className={`${BTN} ${alwaysOnTop ? 'text-[#cc4444]' : 'text-faint hover:text-[#cc4444]'}`}
              onClick={onPinToggle}
            >
              {alwaysOnTop ? PIN_FILLED_ICON : PIN_OUTLINE_ICON}
            </button>
            <button
              title="Close panel"
              className={`${BTN} hover:text-[#e06060]`}
              onClick={onClose}
            >
              {CLOSE_ICON}
            </button>
          </span>
        )}
      </span>
    </div>
  );
}
