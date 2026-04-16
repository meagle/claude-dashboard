import { app, Tray, BrowserWindow, ipcMain, nativeImage, Menu, Notification, shell } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import chokidar from 'chokidar';
import { readSessions, writeSessions, pruneStaleSessions, appendHistory, readHistory, readConfig, DEFAULT_CONFIG } from '@claude-dashboard/shared';
import { focusTerminal } from './focusTerminal';
import { getTrayLabel } from './trayIcon';

const MIN_WIDTH_CARD    = 835;
const MIN_WIDTH_COMPACT = 630;
let currentMinWidth     = MIN_WIDTH_CARD;
const DASHBOARD_DIR  = path.join(os.homedir(), '.config', 'claude-dashboard');
const SESSIONS_FILE  = path.join(DASHBOARD_DIR, 'sessions.json');
const CONFIG_FILE    = path.join(DASHBOARD_DIR, 'config.json');
const HISTORY_FILE   = path.join(DASHBOARD_DIR, 'history.json');
const HOOK_DEST      = path.join(DASHBOARD_DIR, 'hook.js');
const SETTINGS_FILE  = path.join(os.homedir(), '.claude', 'settings.json');

function installHook(): void {
  try {
    // Locate the bundled hook.js — next to the executable when packaged, in the
    // hook package dist/ when running from source.
    const bundledHook = app.isPackaged
      ? path.join(process.resourcesPath, 'hook.js')
      : path.join(__dirname, '../../hook/dist/hook.js');

    if (!fs.existsSync(bundledHook)) return;

    // Always overwrite — ensures a new DMG release delivers the updated hook.
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
    fs.copyFileSync(bundledHook, HOOK_DEST);

    // Patch ~/.claude/settings.json idempotently.
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
      fs.writeFileSync(SETTINGS_FILE, '{}');
    }
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    settings.hooks = settings.hooks ?? {};

    function mergeHook(event: string, arg: string) {
      const entry = {
        matcher: '',
        hooks: [{ type: 'command', command: `node ~/.config/claude-dashboard/hook.js ${arg}` }],
      };
      const existing: unknown[] = settings.hooks[event] ?? [];
      settings.hooks[event] = [
        ...existing.filter((h: unknown) => {
          const hook = h as Record<string, unknown>;
          if (typeof hook.command === 'string' && hook.command.includes('dashboard/hook.js')) return false;
          if (Array.isArray(hook.hooks) && hook.hooks.some((i: unknown) => {
            const item = i as Record<string, unknown>;
            return typeof item.command === 'string' && item.command.includes('dashboard/hook.js');
          })) return false;
          return true;
        }),
        entry,
      ];
    }

    mergeHook('UserPromptSubmit', 'user-prompt');
    mergeHook('PreToolUse',       'pre-tool');
    mergeHook('PostToolUse',      'post-tool');
    mergeHook('Stop',             'stop');
    mergeHook('Notification',     'notification');

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {
    // Non-fatal — dashboard still works, user just won't receive hook events.
  }
}

const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(path.join(__dirname, 'index.html'));

let tray: Tray | null = null;
let popover: BrowserWindow | null = null;
let detachedPanel: BrowserWindow | null = null;
const prevStatusMap = new Map<string, string>();

// Cache isAlive results for 2s to avoid spawning ps on every chokidar tick
const isAliveCache = new Map<number, { result: boolean; ts: number }>();

function isClaudeProcess(pid: number): boolean {
  try {
    const args = execFileSync('ps', ['-o', 'args=', '-p', String(pid)], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    return args.includes('claude');
  } catch {
    return false;
  }
}

function isAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  const cached = isAliveCache.get(pid);
  if (cached && Date.now() - cached.ts < 2000) return cached.result;
  let result = false;
  try {
    process.kill(pid, 0);
    result = isClaudeProcess(pid);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === 'EPERM') result = isClaudeProcess(pid);
  }
  isAliveCache.set(pid, { result, ts: Date.now() });
  return result;
}

function getActiveSessions() {
  const config = readConfig(CONFIG_FILE);
  const all = readSessions(SESSIONS_FILE);
  const cutoff = Date.now() - config.staleSessionMinutes * 60 * 1000;
  const toArchive = all.filter(s => s.lastActivity <= cutoff);
  if (toArchive.length > 0) {
    appendHistory(HISTORY_FILE, toArchive);
    writeSessions(SESSIONS_FILE, all.filter(s => s.lastActivity > cutoff));
  }
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

async function resizeToContent(win: BrowserWindow, maxHeight: number, onHeight: (h: number) => void) {
  if (!win || win.isDestroyed()) return;
  try {
    // Returns [height, isSettings] — settings is never capped by maxHeight
    const [h, isSettings] = await win.webContents.executeJavaScript(
      '(function(){' +
      '  var hdr = document.getElementById("header");' +
      '  var sp  = document.getElementById("settings-panel");' +
      '  var hp  = document.getElementById("history-panel");' +
      '  var ses = document.getElementById("sessions");' +
      '  var hh  = hdr ? hdr.offsetHeight : 0;' +
      // Settings panel has no flex-1 so scrollHeight is reliable; never cap it
      '  if (sp) return [hh + sp.scrollHeight + 24, true];' +
      // For sessions and history: flex-1 stretches the container to fill the window,
      // so scrollHeight reports the window height rather than the content height.
      // Sum children directly: gap-4 (16px) for history, gap-1.5 (6px) for sessions,
      // plus py-1.5 top+bottom padding (12px) for both.
      '  function contentH(el, gap) {' +
      '    if (!el) return 0;' +
      '    var kids = el.children, h = 12, c = 0;' +
      '    for (var i = 0; i < kids.length; i++) {' +
      '      var pos = getComputedStyle(kids[i]).position;' +
      '      if (pos === "absolute" || pos === "fixed") continue;' +
      '      h += kids[i].offsetHeight + (c > 0 ? gap : 0);' +
      '      c++;' +
      '    }' +
      '    return h;' +
      '  }' +
      '  if (hp) return [hh + contentH(hp, 16) + 24, false];' +
      '  return [hh + contentH(ses, 6) + 24, false];' +
      '})()'
    );
    const cap = isSettings ? 2400 : maxHeight;
    const clamped = Math.max(120, Math.min(Math.ceil(h), cap));
    onHeight(clamped);
    const [width] = win.getSize();
    win.setSize(Math.max(width, currentMinWidth), clamped);
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

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'true',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_SSH_COMMAND: 'ssh -oBatchMode=yes',
  GIT_OPTIONAL_LOCKS: '0',
};

function queryGitSummary(cwd: string): string | null {
  try {
    const raw = execFileSync('git', ['diff', '--shortstat', 'HEAD'], {
      cwd,
      env: GIT_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    }).toString().trim();
    if (!raw) return null;
    const files = raw.match(/(\d+) files? changed/);
    const ins   = raw.match(/(\d+) insertion/);
    const del   = raw.match(/(\d+) deletion/);
    const parts: string[] = [];
    if (files) parts.push(`${files[1]} files`);
    if (ins)   parts.push(`+${ins[1]}`);
    if (del)   parts.push(`-${del[1]}`);
    return parts.length > 0 ? parts.join(' ') : null;
  } catch {
    return null;
  }
}

function queryGitAhead(cwd: string): number | null {
  try {
    const raw = execFileSync('git', ['rev-list', '@{u}..HEAD', '--count'], {
      cwd,
      env: GIT_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    }).toString().trim();
    const n = parseInt(raw, 10);
    return isNaN(n) || n === 0 ? null : n;
  } catch {
    return null;
  }
}

function refreshGitInfo() {
  const all = readSessions(SESSIONS_FILE);
  if (all.length === 0) return;

  const aheadCache   = new Map<string, number | null>();
  const summaryCache = new Map<string, string | null>();
  const getAhead   = (dir: string) => { if (!aheadCache.has(dir))   aheadCache.set(dir,   queryGitAhead(dir));   return aheadCache.get(dir)!; };
  const getSummary = (dir: string) => { if (!summaryCache.has(dir)) summaryCache.set(dir, queryGitSummary(dir)); return summaryCache.get(dir)!; };

  let changed = false;
  const updated = all.map(s => {
    if (!s.workingDir) return s;
    const nextSummary = getSummary(s.workingDir);
    const nextAhead   = s.status === 'done' ? getAhead(s.workingDir) : s.gitAhead;
    if (nextSummary !== s.gitSummary || nextAhead !== s.gitAhead) {
      changed = true;
      return { ...s, gitSummary: nextSummary, gitAhead: nextAhead };
    }
    return s;
  });

  // writeSessions triggers chokidar which handles sendSessionsToPopover
  if (changed) writeSessions(SESSIONS_FILE, updated);
}

function buildSessionsPayload() {
  const config = readConfig(CONFIG_FILE);
  const sessions = getActiveSessions();
  const priority = (s: { status: string }) =>
    s.status === 'waiting_permission' ? 0 :
    s.status === 'waiting_input'      ? 1 :
    s.status === 'active'             ? 2 :
    s.status === 'idle'               ? 3 : 4;
  const sorted = [...sessions].sort((a, b) =>
    priority(a) - priority(b) || b.lastActivity - a.lastActivity
  );
  return {
    sessions: sorted,
    cardConfig: {
      showBranch:     config.columns.gitBranch,
      showGitSummary: config.columns.changedFiles,
      showSubagents:  config.columns.subagents,
      showModel:      config.columns.lastAction,
      compactPaths:   config.columns.compactPaths ?? true,
      showCost:       config.columns.cost ?? false,
      showDoneFooter: config.columns.doneFooter ?? true,
      theme:          config.theme ?? 'light',
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
  installHook();

  // Hide from dock — this is a menu bar only app
  if (app.dock) app.dock.hide();

  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.on('right-click', () => {
    tray!.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Quit Claude Dashboard', click: () => app.quit() },
    ]));
  });

  let MAX_HEIGHT = readConfig(CONFIG_FILE).maxHeight ?? 700;
  let cachedHeight = MAX_HEIGHT;

  popover = new BrowserWindow({
    width: currentMinWidth,
    height: MAX_HEIGHT,
    minWidth: currentMinWidth,
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

  popover.on('will-resize', (event, newBounds) => {
    if (newBounds.width < currentMinWidth) event.preventDefault();
  });

  const doResize = (win?: BrowserWindow) => {
    const target = win ?? popover;
    if (!target || target.isDestroyed()) return;
    const isPopover = target === popover;
    resizeToContent(target, MAX_HEIGHT, (h) => { if (isPopover) cachedHeight = h; });
  };

  // Render sessions as soon as the popover is ready so cachedHeight is known before first click
  popover.webContents.on('did-finish-load', async () => {
    if (isDev) popover?.webContents.openDevTools({ mode: 'detach' });
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
    MAX_HEIGHT = updated.maxHeight ?? 700;
    updateTray();
    sendSessionsToPopover();
  });

  ipcMain.handle('get-history', () => readHistory(HISTORY_FILE));

  ipcMain.handle('uninstall', () => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        if (settings.hooks) {
          for (const event of Object.keys(settings.hooks)) {
            settings.hooks[event] = (settings.hooks[event] as unknown[]).filter((h: unknown) => {
              const hook = h as Record<string, unknown>;
              if (typeof hook.command === 'string' && hook.command.includes('dashboard/hook.js')) return false;
              if (Array.isArray(hook.hooks) && hook.hooks.some((i: unknown) => {
                const item = i as Record<string, unknown>;
                return typeof item.command === 'string' && item.command.includes('dashboard/hook.js');
              })) return false;
              return true;
            });
            if ((settings.hooks[event] as unknown[]).length === 0) delete settings.hooks[event];
          }
          if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      }
    } catch { }
    app.quit();
  });

  ipcMain.on('resize-to-fit', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    setTimeout(() => doResize(win), 50);
  });

  ipcMain.on('dismiss-session', (_event, sessionId: string) => {
    const all = readSessions(SESSIONS_FILE);
    const toArchive = all.filter(s => s.sessionId === sessionId);
    if (toArchive.length > 0) appendHistory(HISTORY_FILE, toArchive);
    writeSessions(SESSIONS_FILE, all.filter(s => s.sessionId !== sessionId));
  });

  ipcMain.on('open-detached-panel', () => {
    if (detachedPanel && !detachedPanel.isDestroyed()) {
      detachedPanel.focus();
      return;
    }
    detachedPanel = new BrowserWindow({
      width: currentMinWidth,
      height: MAX_HEIGHT,
      minWidth: currentMinWidth,
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
    detachedPanel.on('will-resize', (event, newBounds) => {
      if (newBounds.width < currentMinWidth) event.preventDefault();
    });
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

  ipcMain.on('set-compact-mode', (_event, compact: boolean) => {
    currentMinWidth = compact ? MIN_WIDTH_COMPACT : MIN_WIDTH_CARD;
    popover?.setMinimumSize(currentMinWidth, 200);
    if (detachedPanel && !detachedPanel.isDestroyed()) {
      detachedPanel.setMinimumSize(currentMinWidth, 200);
    }
  });

  // Debounced git refresh: coalesce rapid chokidar ticks into one git query
  let gitRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleGitRefresh = () => {
    if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
    gitRefreshTimer = setTimeout(refreshGitInfo, 2000);
  };

  const watcher = chokidar.watch([SESSIONS_FILE, CONFIG_FILE], { ignoreInitial: false });
  watcher.on('add', updateTray);
  watcher.on('change', () => { MAX_HEIGHT = readConfig(CONFIG_FILE).maxHeight ?? 700; checkNotifications(); updateTray(); sendSessionsToPopover(); setTimeout(doResize, 100); scheduleGitRefresh(); });

  updateTray();
  setInterval(refreshGitInfo, 10_000);

  // Catch changes not triggered by file writes: dead processes (idle→done) and stale expiry.
  // Compare sessionId:status so status changes (not just adds/removes) trigger updates.
  let lastSessionSnapshot = '';
  setInterval(() => {
    const snapshot = getActiveSessions().map(s => `${s.sessionId}:${s.status}`).sort().join(',');
    if (snapshot !== lastSessionSnapshot) {
      lastSessionSnapshot = snapshot;
      sendSessionsToPopover();
      setTimeout(doResize, 100);
    }
  }, 5_000);
});

app.on('window-all-closed', () => {
  // keep running — menu bar app has no windows
});

app.on('before-quit', () => {
  tray?.destroy();
  tray = null;
});
