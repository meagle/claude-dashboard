import React, { useState } from 'react';
import { Box, Text, useApp, useInput, Key } from 'ink';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { useSessionsFile } from './useSessionsFile';
import { useConfigFile } from './useConfigFile';
import { CompactTable } from './CompactTable';
import { DetailView } from './DetailView';
import { KEYMAP } from './keymap';
import { writeSessions } from '@claude-dashboard/shared';

const SESSIONS_FILE = path.join(os.homedir(), '.claude', 'dashboard', 'sessions.json');
const CONFIG_FILE   = path.join(os.homedir(), '.claude', 'dashboard', 'config.json');

export function App() {
  const { exit } = useApp();
  const config   = useConfigFile(CONFIG_FILE);
  const sessions = useSessionsFile(SESSIONS_FILE, config.staleSessionMinutes);

  const [detailMode, setDetailMode] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const visible = sessions.filter((s) => !s.dismissed);
  const clampedIdx = Math.min(selectedIdx, Math.max(0, visible.length - 1));

  useInput((input: string, key: Key) => {
    if (input === KEYMAP.QUIT || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    if (input === KEYMAP.DETAIL_TOGGLE) {
      setDetailMode((v) => !v);
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => Math.min(visible.length - 1, i + 1));
      return;
    }
    if (input === KEYMAP.DISMISS) {
      const target = visible[clampedIdx];
      if (target && target.status === 'done') {
        const updated = sessions.map((s) =>
          s.sessionId === target.sessionId ? { ...s, dismissed: true } : s
        );
        writeSessions(SESSIONS_FILE, updated);
      }
      return;
    }
    if (input === KEYMAP.CLEAR_DONE) {
      const updated = sessions.map((s) =>
        s.status === 'done' ? { ...s, dismissed: true } : s
      );
      writeSessions(SESSIONS_FILE, updated);
      return;
    }
    if (input === KEYMAP.SETTINGS) {
      const editor = process.env.EDITOR ?? 'vim';
      try {
        execSync(`${editor} ${CONFIG_FILE}`, { stdio: 'inherit' });
      } catch {
        // ignore editor errors
      }
    }
  });

  const active = visible.filter(
    (s) => s.status === 'active' || s.status === 'waiting_permission' || s.status === 'waiting_input'
  ).length;

  const now = new Date();
  const timeStr = now.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold>🤖 Claude Dashboard  •  {visible.length} sessions  •  {active} active</Text>
        <Text dimColor>{timeStr}</Text>
      </Box>

      <Box marginY={1}>
        {detailMode ? (
          <DetailView sessions={visible} selectedIdx={clampedIdx} config={config} />
        ) : (
          <CompactTable sessions={visible} selectedIdx={clampedIdx} config={config} />
        )}
      </Box>

      <Text dimColor>
        [d] detail   [x] dismiss   [C] clear done   [s] settings   [q] quit   [↑↓] navigate
      </Text>
    </Box>
  );
}
