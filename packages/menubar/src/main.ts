import { app, Tray, BrowserWindow, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as os from 'os';
import chokidar from 'chokidar';
import { readSessions, pruneStaleSessions, readConfig } from '@claude-dashboard/shared';
import { focusTerminalByPid } from './focusTerminal';
import { getTrayLabel } from './trayIcon';

const SESSIONS_FILE = path.join(os.homedir(), '.claude', 'dashboard', 'sessions.json');
const CONFIG_FILE   = path.join(os.homedir(), '.claude', 'dashboard', 'config.json');

let tray: Tray | null = null;
let popover: BrowserWindow | null = null;

function getActiveSessions() {
  const config = readConfig(CONFIG_FILE);
  const all = readSessions(SESSIONS_FILE);
  return pruneStaleSessions(all, config.staleSessionMinutes).filter((s) => !s.dismissed);
}

function updateTray() {
  if (!tray) return;
  const sessions = getActiveSessions();
  const label = getTrayLabel(sessions);
  tray.setTitle(label);
  tray.setToolTip(label ? `Claude Sessions: ${sessions.length}` : 'Claude Dashboard');
}

function sendSessionsToPopover() {
  if (!popover || popover.isDestroyed()) return;
  const config = readConfig(CONFIG_FILE);
  const sessions = getActiveSessions();
  popover.webContents.send('sessions-update', { sessions, showCost: config.columns.cost });
}

app.whenReady().then(() => {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle('🤖');

  popover = new BrowserWindow({
    width: 340,
    height: 400,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  popover.loadFile(path.join(__dirname, 'popover.html'));

  tray.on('click', () => {
    if (!popover || popover.isDestroyed()) return;
    if (popover.isVisible()) {
      popover.hide();
    } else {
      const bounds = tray!.getBounds();
      popover.setPosition(
        Math.round(bounds.x - 170 + bounds.width / 2),
        Math.round(bounds.y + bounds.height)
      );
      sendSessionsToPopover();
      popover.show();
      popover.focus();
    }
  });

  popover.on('blur', () => popover?.hide());

  ipcMain.on('focus-terminal', (_event, pid: number) => {
    focusTerminalByPid(pid);
    popover?.hide();
  });

  ipcMain.on('open-tui', () => {
    const { execSync } = require('child_process');
    try {
      execSync('open -a Terminal', { stdio: 'ignore' });
      execSync(`osascript -e 'tell application "Terminal" to do script "claude-dashboard"'`);
    } catch {
      // ignore
    }
    popover?.hide();
  });

  const watcher = chokidar.watch([SESSIONS_FILE, CONFIG_FILE], { ignoreInitial: false });
  watcher.on('add', updateTray);
  watcher.on('change', () => { updateTray(); sendSessionsToPopover(); });

  updateTray();
});

app.on('window-all-closed', () => {
  // keep running — menu bar app has no windows
});
