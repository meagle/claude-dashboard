import React from "react";

interface BadgeProps {
  status: string;
  lastActivity: number;
  size?: 'sm' | 'md';
}

export function Badge({ status, lastActivity, size = 'md' }: BadgeProps) {
  const dim = size === 'sm' ? 12 : 20;
  const FILLED = (
    <svg viewBox="0 0 10 10" width={dim} height={dim} xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="5" r="4.5" fill="currentColor" />
    </svg>
  );
  const HOLLOW = (
    <svg viewBox="0 0 10 10" width={dim} height={dim} xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );

  if (status === "done") {
    return <span className="shrink-0 inline-flex items-center text-badge-done">{FILLED}</span>;
  }
  if (status === "waiting_permission" || status === "waiting_input") {
    return <span className="shrink-0 inline-flex items-center text-badge-waiting animate-status-pulse">{FILLED}</span>;
  }
  if (status === "active") {
    return <span className="shrink-0 inline-flex items-center text-badge-active animate-status-pulse">{FILLED}</span>;
  }
  return <span className="shrink-0 inline-flex items-center text-badge-idle">{HOLLOW}</span>;
}
