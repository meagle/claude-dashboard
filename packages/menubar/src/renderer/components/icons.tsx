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

export const COPY_ICON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
