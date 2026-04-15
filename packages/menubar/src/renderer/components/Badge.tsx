import React from "react";

interface BadgeProps {
  status: string;
  lastActivity: number;
  errorState: boolean;
  loopTool: string | null;
  loopCount: number;
}

export function Badge({
  status,
  lastActivity,
  errorState,
  loopTool,
  loopCount,
}: BadgeProps) {
  let badge: React.ReactNode;

  if (status === "done") {
    badge = <span className="shrink-0 text-2xl leading-none text-badge-done">●</span>;
  } else if (status === "waiting_permission" || status === "waiting_input") {
    badge = <span className="shrink-0 text-2xl leading-none text-badge-waiting">●</span>;
  } else if (status === "active") {
    badge = <span className="shrink-0 text-2xl leading-none text-badge-active">●</span>;
  } else {
    badge = <span className="shrink-0 text-2xl leading-none text-badge-idle">○</span>;
  }

  return <>{badge}</>;
}
