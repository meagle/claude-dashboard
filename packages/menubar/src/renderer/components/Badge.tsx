import React from "react";

interface BadgeProps {
  status: string;
  lastActivity: number;
}

const FILLED = (
  <svg viewBox="0 0 10 10" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="5" r="4.5" fill="currentColor" />
  </svg>
);

const HOLLOW = (
  <svg viewBox="0 0 10 10" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export function Badge({ status, lastActivity }: BadgeProps) {
  if (status === "done") {
    return <span className="shrink-0 inline-flex items-center text-badge-done">{FILLED}</span>;
  }
  if (status === "waiting_permission" || status === "waiting_input") {
    return <span className="shrink-0 inline-flex items-center text-badge-waiting">{FILLED}</span>;
  }
  if (status === "active") {
    return <span className="shrink-0 inline-flex items-center text-badge-active">{FILLED}</span>;
  }
  return <span className="shrink-0 inline-flex items-center text-badge-idle">{HOLLOW}</span>;
}
