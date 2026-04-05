import React from 'react';
import { Text } from 'ink';
import { Session } from '@claude-dashboard/shared';

const STATUS_CONFIG: Record<
  Session['status'],
  { icon: string; color: string; label: string }
> = {
  active:             { icon: '●', color: 'green',   label: 'active' },
  waiting_permission: { icon: '🔐', color: 'red',     label: 'WAITING' },
  waiting_input:      { icon: '❓', color: 'yellow',  label: 'INPUT' },
  idle:               { icon: '○', color: 'yellow',  label: 'idle' },
  done:               { icon: '✅', color: 'gray',    label: 'done' },
};

interface Props {
  status: Session['status'];
  errorState: boolean;
}

export function StatusBadge({ status, errorState }: Props) {
  const { icon, color, label } = STATUS_CONFIG[status];
  return (
    <Text color={color}>
      {icon} {label.toUpperCase()}{errorState ? ' 🔴' : ''}
    </Text>
  );
}
