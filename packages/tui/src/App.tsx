import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput, Key } from 'ink';
import { Splash } from './Splash';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { useSessionsFile } from './useSessionsFile';
import { useConfigFile } from './useConfigFile';
import { CompactTable } from './CompactTable';
import { DetailView } from './DetailView';
import { KEYMAP } from './keymap';
import { writeSessions } from '@claude-dashboard/shared';

const SESSIONS_FILE = path.join(os.homedir(), '.claude', 'dashboard', 'sessions.json');
const CONFIG_FILE   = path.join(os.homedir(), '.claude', 'dashboard', 'config.json');

function focusTerminalByPid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try {
    const script = `
tell application "System Events"
  set targetProcess to first process whose unix id is ${pid}
  set frontmost of targetProcess to true
end tell
activate application (name of first application process whose unix id is ${pid})`.trim();
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  } catch {
    // silently ignore — non-macOS or permission denied
  }
}

function ensureDashboardDir(): void {
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function App() {
  const { exit } = useApp();
  const config   = useConfigFile(CONFIG_FILE);
  const sessions = useSessionsFile(SESSIONS_FILE, config.staleSessionMinutes);

  const [showSplash, setShowSplash] = useState(true);
  const [detailMode, setDetailMode] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

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
        ensureDashboardDir();
        writeSessions(SESSIONS_FILE, updated);
      }
      return;
    }
    if (input === KEYMAP.CLEAR_DONE) {
      const updated = sessions.map((s) =>
        s.status === 'done' ? { ...s, dismissed: true } : s
      );
      ensureDashboardDir();
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
      return;
    }
    if (key.return) {
      const target = visible[clampedIdx];
      if (target) focusTerminalByPid(target.pid);
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

  if (showSplash) return <Splash />;

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
        [↵] focus   [d] detail   [x] dismiss   [C] clear done   [s] settings   [q] quit   [↑↓] navigate
      </Text>
    </Box>
  );
}
