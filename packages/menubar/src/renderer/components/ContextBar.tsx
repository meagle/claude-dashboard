import React from 'react';
import { ctxBarClass } from '../utils/format';

interface ContextBarProps {
  pct: number;
}

export function ContextBar({ pct }: ContextBarProps) {
  return (
    <span className="ctx-bar">
      <div className="ctx-track">
        <div className={ctxBarClass(pct)} style={{ width: `${pct}%` }} />
      </div>
      <span className="ctx-pct">{pct}%</span>
    </span>
  );
}
