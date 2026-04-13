import React from 'react';
import { ctxBarClass } from '../utils/format';

interface ContextBarProps {
  pct: number;
}

export function ContextBar({ pct }: ContextBarProps) {
  return (
    <span className="flex items-center gap-[5px]">
      <div className="w-20 h-[5px] bg-ctx-track rounded-[2px] overflow-hidden">
        <div className={ctxBarClass(pct)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-faint text-sm">{pct}%</span>
    </span>
  );
}
