import { app, Tray, BrowserWindow, ipcMain, nativeImage, Menu, Notification, shell } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import chokidar from 'chokidar';
import { readSessions, writeSessions, pruneStaleSessions, readConfig, DEFAULT_CONFIG } from '@claude-dashboard/shared';
import { focusTerminal } from './focusTerminal';
import { getTrayLabel } from './trayIcon';

const SESSIONS_FILE = path.join(os.homedir(), '.config', 'claude-dashboard', 'sessions.json');
const CONFIG_FILE   = path.join(os.homedir(), '.config', 'claude-dashboard', 'config.json');

const isDev = !fs.existsSync(path.join(__dirname, 'index.html'));

let tray: Tray | null = null;
let popover: BrowserWindow | null = null;
let detachedPanel: BrowserWindow | null = null;
const prevStatusMap = new Map<string, string>();

function isClaudeProcess(pid: number): boolean {
  try {
    const args = execSync(`ps -o args= -p ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    return args.includes('claude');
  } catch {
    return false;
  }
}

function isAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    // PID exists — verify it's actually a Claude process, not a reused PID
    return isClaudeProcess(pid);
  } catch (e: any) {
    if (e?.code === 'EPERM') return isClaudeProcess(pid);
    return false;
  }
}

function getActiveSessions() {
  const config = readConfig(CONFIG_FILE);
  const all = readSessions(SESSIONS_FILE);
  return pruneStaleSessions(all, config.staleSessionMinutes)
    .filter((s) => !s.dismissed)
    .filter((s) => {
      // Hide done sessions after 60s once the Claude process is confirmed dead
      if (s.status === 'done' && !isAlive(s.pid) && Date.now() - s.lastActivity > 60_000) return false;
      return true;
    })
    .map((s) => {
      if (s.status !== 'done' && !isAlive(s.pid)) return { ...s, status: 'done' as const };
      return s;
    });
}

function updateTray() {
  if (!tray) return;
  const sessions = getActiveSessions();
  const label = getTrayLabel(sessions);
  tray.setTitle(label);
  tray.setToolTip(sessions.length > 0 ? `Claude Sessions: ${sessions.length}` : 'Claude Dashboard');
}

async function resizeToContent(maxHeight: number, onHeight: (h: number) => void) {
  if (!popover || popover.isDestroyed()) return;
  try {
    const h = await popover.webContents.executeJavaScript(
      '(function(){' +
      '  var hdr = document.getElementById("header");' +
      '  var sp  = document.getElementById("settings-panel");' +
      '  var ses = document.getElementById("sessions");' +
      '  var hh  = hdr ? hdr.offsetHeight : 0;' +
      '  if (sp) return hh + sp.scrollHeight + 24;' +
      '  return hh + (ses ? ses.scrollHeight : 0) + 24;' +
      '})()'
    );
    const clamped = Math.max(120, Math.min(Math.ceil(h), maxHeight));
    onHeight(clamped);
    const [width] = popover.getSize();
    popover.setSize(width, clamped);
  } catch { /* ignore if popover not ready */ }
}

function checkNotifications() {
  const config = readConfig(CONFIG_FILE);
  const sessions = getActiveSessions();
  const currentIds = new Set(sessions.map(s => s.sessionId));

  for (const s of sessions) {
    const prev = prevStatusMap.get(s.sessionId);
    const curr = s.status;

    if (prev !== undefined && prev !== curr) {
      const wantsNotif  = config.notifications       ?? true;
      const wantsSound  = config.notificationSound   ?? true;

      if (curr === 'waiting_permission') {
        if (wantsSound) shell.beep();
        if (wantsNotif) new Notification({ title: 'Permission needed', body: `${s.dirName}: tool approval required`, silent: true }).show();
      } else if (curr === 'waiting_input') {
        if (wantsSound) shell.beep();
        if (wantsNotif) new Notification({ title: 'Input needed', body: `${s.dirName}: Claude asked a question`, silent: true }).show();
      } else if (curr === 'done' && prev !== 'done') {
        if (wantsNotif) new Notification({ title: 'Session done', body: `${s.dirName}: task completed`, silent: true }).show();
      }
    }

    prevStatusMap.set(s.sessionId, curr);
  }

  // Clean up removed sessions
  for (const id of prevStatusMap.keys()) {
    if (!currentIds.has(id)) prevStatusMap.delete(id);
  }
}

function buildSessionsPayload() {
  const config = readConfig(CONFIG_FILE);
  const sessions = getActiveSessions();
  const priority = (s: { status: string }) =>
    s.status === 'waiting_permission' ? 0 :
    s.status === 'waiting_input'      ? 1 : 2;
  const sorted = [...sessions].sort((a, b) => priority(a) - priority(b));
  return {
    sessions: sorted,
    cardConfig: {
      showBranch:     config.columns.gitBranch,
      showGitSummary: config.columns.changedFiles,
      showSubagents:  config.columns.subagents,
      showModel:      config.columns.lastAction,
      compactPaths:   config.columns.compactPaths ?? true,
      showCost:       config.columns.cost ?? true,
    },
    home: os.homedir(),
  };
}

function sendSessionsToPopover() {
  const payload = buildSessionsPayload();
  if (popover && !popover.isDestroyed()) popover.webContents.send('sessions-update', payload);
  if (detachedPanel && !detachedPanel.isDestroyed()) detachedPanel.webContents.send('sessions-update', payload);
}

app.whenReady().then(() => {
  // Hide from dock — this is a menu bar only app
  if (app.dock) app.dock.hide();

  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.on('right-click', () => {
    tray!.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Quit Claude Dashboard', click: () => app.quit() },
    ]));
  });

  const MAX_HEIGHT = 700;
  let cachedHeight = MAX_HEIGHT;

  popover = new BrowserWindow({
    width: 700,
    height: MAX_HEIGHT,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  if (isDev) {
    popover.loadURL('http://localhost:5173');
  } else {
    popover.loadFile(path.join(__dirname, 'index.html'));
  }

  const doResize = () => resizeToContent(MAX_HEIGHT, (h) => { cachedHeight = h; });

  // Render sessions as soon as the popover is ready so cachedHeight is known before first click
  popover.webContents.on('did-finish-load', async () => {
    sendSessionsToPopover();
    setTimeout(doResize, 100);
  });

  tray.on('click', () => {
    if (!popover || popover.isDestroyed()) return;
    if (popover.isVisible()) {
      popover.hide();
    } else {
      const bounds = tray!.getBounds();
      // Pre-size to cached height before showing to avoid flash of full-height window
      popover.setBounds({
        x: Math.round(bounds.x - 350 + bounds.width / 2),
        y: Math.round(bounds.y + bounds.height),
        width: 700,
        height: cachedHeight,
      });
      sendSessionsToPopover();
      popover.show();
      popover.focus();
      setTimeout(doResize, 100);
    }
  });

  popover.on('blur', () => popover?.hide());

  ipcMain.on('focus-terminal', (_event, pid: number, termSessionId: string | null) => {
    focusTerminal(pid, termSessionId);
    popover?.hide();
  });

  ipcMain.handle('get-config', () => readConfig(CONFIG_FILE));

  ipcMain.handle('save-config', (_event, partial: Record<string, unknown>) => {
    const current = readConfig(CONFIG_FILE);
    const updated = {
      ...DEFAULT_CONFIG,
      ...current,
      ...partial,
      columns: { ...DEFAULT_CONFIG.columns, ...current.columns, ...((partial.columns as object) ?? {}) },
    };
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
    updateTray();
    sendSessionsToPopover();
  });

  ipcMain.on('resize-to-fit', () => { setTimeout(doResize, 50); });

  ipcMain.on('dismiss-session', (_event, sessionId: string) => {
    const all = readSessions(SESSIONS_FILE);
    writeSessions(SESSIONS_FILE, all.map(s => s.sessionId === sessionId ? { ...s, dismissed: true } : s));
  });

  ipcMain.on('open-detached-panel', () => {
    if (detachedPanel && !detachedPanel.isDestroyed()) {
      detachedPanel.focus();
      return;
    }
    detachedPanel = new BrowserWindow({
      width: 720,
      height: 600,
      minWidth: 420,
      minHeight: 200,
      show: true,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    if (isDev) {
      detachedPanel.loadURL('http://localhost:5173/#detached');
    } else {
      detachedPanel.loadFile(path.join(__dirname, 'index.html'), { hash: 'detached' });
    }
    detachedPanel.webContents.on('did-finish-load', () => {
      if (detachedPanel && !detachedPanel.isDestroyed()) {
        detachedPanel.webContents.send('sessions-update', buildSessionsPayload());
      }
    });
    detachedPanel.on('closed', () => { detachedPanel = null; });
  });

  ipcMain.handle('set-always-on-top', (event, value: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setAlwaysOnTop(value);
  });

  const watcher = chokidar.watch([SESSIONS_FILE, CONFIG_FILE], { ignoreInitial: false });
  watcher.on('add', updateTray);
  watcher.on('change', () => { checkNotifications(); updateTray(); sendSessionsToPopover(); setTimeout(doResize, 100); });

  updateTray();
});

app.on('window-all-closed', () => {
  // keep running — menu bar app has no windows
});

app.on('before-quit', () => {
  tray?.destroy();
  tray = null;
});
