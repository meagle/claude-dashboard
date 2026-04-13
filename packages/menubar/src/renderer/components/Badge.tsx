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
      <span className="font-bold shrink-0 text-badge-done">
        ● DONE{' '}
        <span className="font-normal text-[13px] text-faint">{agoStr(lastActivity)}</span>
      </span>
    );
  } else if (status === 'waiting_permission') {
    badge = <span className="font-bold shrink-0 text-badge-waiting">● PERMISSION</span>;
  } else if (status === 'waiting_input') {
    badge = <span className="font-bold shrink-0 text-badge-waiting">● INPUT</span>;
  } else if (status === 'active') {
    badge = <span className="font-bold shrink-0 text-badge-active">● ACTIVE</span>;
  } else {
    badge = <span className="font-bold shrink-0 text-badge-idle">○ IDLE</span>;
  }

  return (
    <>
      {badge}
      {errorState && (
        <span className="font-bold text-badge-loop">
          {' '}LOOP{loopTool ? ` 🔧 ${loopTool} ×${loopCount}` : ''}
        </span>
      )}
    </>
  );
}
