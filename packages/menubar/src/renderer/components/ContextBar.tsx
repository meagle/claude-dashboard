import React from 'react';
import { ctxBarClass } from '../utils/format';

interface ContextBarProps {
  pct: number;
}

export function ContextBar({ pct }: ContextBarProps) {
  return (
    <span className="flex items-center gap-1.25">
      <div className="w-20 h-1.25 bg-ctx-track rounded-ctx overflow-hidden">
        <div className={ctxBarClass(pct)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-faint text-sm">{pct}%</span>
    </span>
  );
}
