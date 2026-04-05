import React from 'react';
import { Text } from 'ink';

interface Props {
  pct: number;
  width?: number;
}

export function ProgressBar({ pct, width = 6 }: Props) {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return <Text>{'█'.repeat(filled) + '░'.repeat(empty)}</Text>;
}
