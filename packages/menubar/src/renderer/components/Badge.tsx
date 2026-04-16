import React from "react";

interface BadgeProps {
  status: string;
  lastActivity: number;
  size?: 'sm' | 'md';
}

function SphereSvg({ gradId, base, light, dark, dim }: { gradId: string; base: string; light: string; dark: string; dim: number }) {
  return (
    <svg viewBox="0 0 10 10" width={dim} height={dim} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="65%" fx="38%" fy="32%">
          <stop offset="0%" stopColor={light} />
          <stop offset="45%" stopColor={base} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      <circle cx="5" cy="5" r="4.5" fill={`url(#${gradId})`} />
    </svg>
  );
}

export function Badge({ status, lastActivity, size = 'md' }: BadgeProps) {
  const dim = size === 'sm' ? 12 : 20;

  const HOLLOW = (
    <svg viewBox="0 0 10 10" width={dim} height={dim} xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );

  if (status === "done") {
    return (
      <span className="shrink-0 inline-flex items-center">
        <SphereSvg gradId="grad-done" base="#888888" light="#c0c0c0" dark="#3a3a3a" dim={dim} />
      </span>
    );
  }
  if (status === "waiting_permission" || status === "waiting_input") {
    return (
      <span className="shrink-0 inline-flex items-center animate-status-pulse">
        <SphereSvg gradId="grad-waiting" base="#d97706" light="#f5c060" dark="#6b3600" dim={dim} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="shrink-0 inline-flex items-center animate-status-pulse">
        <SphereSvg gradId="grad-active" base="#3fb950" light="#90e8a0" dark="#1a5c28" dim={dim} />
      </span>
    );
  }
  return <span className="shrink-0 inline-flex items-center text-badge-idle">{HOLLOW}</span>;
}
