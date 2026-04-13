import React from 'react';
import { agoStr } from '../utils/format';

interface BadgeProps {
  status: string;
  lastActivity: number;
  errorState: boolean;
  loopTool: string | null;
  loopCount: number;
}

export function Badge({ status, lastActivity, errorState, loopTool, loopCount }: BadgeProps) {
  let badge: React.ReactNode;

  if (status === 'done') {
    badge = (
      <span className="badge-done">
        ● DONE <span className="badge-time">{agoStr(lastActivity)}</span>
      </span>
    );
  } else if (status === 'waiting_permission') {
    badge = <span className="badge-waiting">● PERMISSION</span>;
  } else if (status === 'waiting_input') {
    badge = <span className="badge-waiting">● INPUT</span>;
  } else if (status === 'active') {
    badge = <span className="badge-active">● ACTIVE</span>;
  } else {
    badge = <span className="badge-idle">○ IDLE</span>;
  }

  return (
    <>
      {badge}
      {errorState && (
        <span className="badge-loop">
          {' '}LOOP{loopTool ? ` 🔧 ${loopTool} ×${loopCount}` : ''}
        </span>
      )}
    </>
  );
}
