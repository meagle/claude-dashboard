import React from 'react';

export const CLAUDE_ICON_PATH = "M17 7a8 8 0 1 0 0 10";

export const CLAUDE_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    aria-hidden
  >
    <path d={CLAUDE_ICON_PATH} />
  </svg>
);

// ── Agent glyphs ──────────────────────────────────────────────────────────
// One per SOURCE_META iconKey; utils/agentIdentity.ts maps iconKey → glyph.
// Deliberately simple monochrome strokes (they inherit the agent's color via
// currentColor) rather than brand marks, so they stay legible at 13px.

export const CURSOR_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3 21 19H3Z" />
  </svg>
);

export const CODEX_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2.5 20 7v10l-8 4.5L4 17V7Z" />
  </svg>
);

// Fallback for a source this build doesn't recognize (e.g. sessions.json written
// by a newer hook). A generic terminal glyph — never a Claude mark.
export const AGENT_FALLBACK_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

export const COPY_ICON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
