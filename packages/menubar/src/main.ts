import {
  app,
  Tray,
  BrowserWindow,
  ipcMain,
  nativeImage,
  Menu,
  Notification,
  shell,
  screen,
} from "electron";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { execFileSync } from "child_process";
import chokidar from "chokidar";
import {
  readSessions,
  writeSessions,
  pruneStaleSessions,
  appendHistory,
  readHistory,
  readConfig,
  DEFAULT_CONFIG,
  modelContextWindowFromConfig,
} from "@claude-dashboard/shared";
import { focusTerminal, findParentApp } from "./focusTerminal";
import { TrayIconController } from "./trayIcon";

const MIN_WIDTH_CARD = 530;
const MIN_WIDTH_COMPACT = 530;
const MIN_HEIGHT_CARD = 200;
const MIN_HEIGHT_COMPACT = 80;
type ViewMode = 'card' | 'compact';
let currentMinWidth = MIN_WIDTH_CARD;
let currentViewMode: ViewMode = 'card';
let isProgrammaticResize = false;
const DASHBOARD_DIR = path.join(os.homedir(), ".config", "claude-dashboard");
const SESSIONS_FILE = path.join(DASHBOARD_DIR, "sessions.json");
const CONFIG_FILE = path.join(DASHBOARD_DIR, "config.json");
const HISTORY_FILE = path.join(DASHBOARD_DIR, "history.json");
const HOOK_DEST = path.join(DASHBOARD_DIR, "hook.js");
const WINDOW_STATE_FILE = path.join(DASHBOARD_DIR, "window-state.json");
const SETTINGS_FILE = path.join(os.homedir(), ".claude", "settings.json");

interface WindowState {
  cardWidth: number;
  compactWidth: number;
  panelX?: number;
  panelY?: number;
  panelWidth?: number;
  panelHeight?: number;
}

function readWindowState(): WindowState {
  try {
    return {
      cardWidth: MIN_WIDTH_CARD,
      compactWidth: MIN_WIDTH_COMPACT,
      ...JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, "utf8")),
    };
  } catch {
    return { cardWidth: MIN_WIDTH_CARD, compactWidth: MIN_WIDTH_COMPACT };
  }
}

function writeWindowState(state: WindowState): void {
  try {
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const windowState = readWindowState();

function isDashboardHook(h: unknown): boolean {
  const hook = h as Record<string, unknown>;
  if (typeof hook.command === "string" && hook.command.includes("dashboard/hook.js"))
    return true;
  if (
    Array.isArray(hook.hooks) &&
    hook.hooks.some((i: unknown) => {
      const item = i as Record<string, unknown>;
      return typeof item.command === "string" && item.command.includes("dashboard/hook.js");
    })
  )
    return true;
  return false;
}

function installHook(): void {
  try {
    // Locate the bundled hook.js — next to the executable when packaged, in the
    // hook package dist/ when running from source.
    const bundledHook = app.isPackaged
      ? path.join(process.resourcesPath, "hook.js")
      : path.join(__dirname, "../../hook/dist/hook.js");

    if (!fs.existsSync(bundledHook)) return;

    // Always overwrite — ensures a new DMG release delivers the updated hook.
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
    fs.copyFileSync(bundledHook, HOOK_DEST);
    fs.chmodSync(HOOK_DEST, 0o644);

    // Patch ~/.claude/settings.json idempotently.
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
      fs.writeFileSync(SETTINGS_FILE, "{}");
    }
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    settings.hooks = settings.hooks ?? {};

    function mergeHook(event: string, arg: string) {
      const entry = {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `node ~/.config/claude-dashboard/hook.js ${arg}`,
          },
        ],
      };
      const existing: unknown[] = settings.hooks[event] ?? [];
      settings.hooks[event] = [
        ...existing.filter((h) => !isDashboardHook(h)),
        entry,
      ];
    }

    mergeHook("UserPromptSubmit", "user-prompt");
    mergeHook("PreToolUse", "pre-tool");
    mergeHook("PostToolUse", "post-tool");
    mergeHook("Stop", "stop");
    mergeHook("Notification", "notification");

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {
    // Non-fatal — dashboard still works, user just won't receive hook events.
  }
}

const isDev =
  process.env.NODE_ENV === "development" ||
  !fs.existsSync(path.join(__dirname, "index.html"));

let tray: Tray | null = null;
let trayIconCtrl: TrayIconController | null = null;
let showBadgeCount = false;
let popover: BrowserWindow | null = null;
let detachedPanel: BrowserWindow | null = null;
let isDetachedOpaque = false;
let detachedHoverPoll: ReturnType<typeof setInterval> | null = null;

function stopDetachedHoverPoll() {
  if (detachedHoverPoll) {
    clearInterval(detachedHoverPoll);
    detachedHoverPoll = null;
  }
}
let gitRefreshInterval: ReturnType<typeof setInterval> | null = null;
let sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
const prevStatusMap = new Map<string, string>();

// Cache isAlive results for 2s to avoid spawning ps on every chokidar tick
const isAliveCache = new Map<number, { result: boolean; ts: number }>();
// Cache app name lookups — only cache hits; misses are retried until resolved
const appNameCache = new Map<number, string>();
const APP_DISPLAY_NAMES: Record<string, string> = { 'Visual Studio Code': 'VS Code' };
function getAppName(pid: number): string | null {
  if (appNameCache.has(pid)) return appNameCache.get(pid)!;
  const name = findParentApp(pid);
  if (name) {
    const display = APP_DISPLAY_NAMES[name] ?? name;
    appNameCache.set(pid, display);
    return display;
  }
  return null;
}

function isClaudeProcess(pid: number): boolean {
  try {
    const args = execFileSync("ps", ["-o", "args=", "-p", String(pid)], {
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return args.includes("claude");
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
    if ((e as NodeJS.ErrnoException)?.code === "EPERM")
      result = isClaudeProcess(pid);
  }
  isAliveCache.set(pid, { result, ts: Date.now() });
  return result;
}

function getActiveSessions() {
  const config = readConfig(CONFIG_FILE);
  const all = readSessions(SESSIONS_FILE);
  const cutoff = Date.now() - config.staleSessionMinutes * 60 * 1000;
  const toArchive = all.filter((s) => s.lastActivity <= cutoff);
  if (toArchive.length > 0) {
    appendHistory(HISTORY_FILE, toArchive);
    writeSessions(
      SESSIONS_FILE,
      all.filter((s) => s.lastActivity > cutoff),
    );
  }
  type S = ReturnType<typeof pruneStaleSessions>[number];
  const live = pruneStaleSessions(all, config.staleSessionMinutes)
    .filter((s) => !s.dismissed)
    .map((s): S => {
      if (s.status !== "done" && !isAlive(s.pid))
        return { ...s, status: "done" as const };
      return s;
    });

  // Deduplicate by pid+termSessionId: same terminal reused after Escape produces
  // two entries sharing these fields. Keep the newest (by startedAt), mark older done.
  const groups = new Map<string, S[]>();
  const ungrouped: S[] = [];
  for (const s of live) {
    const k = s.pid && s.termSessionId ? `${s.pid}:${s.termSessionId}` : null;
    if (!k) { ungrouped.push(s); continue; }
    const g = groups.get(k) ?? [];
    g.push(s);
    groups.set(k, g);
  }
  const deduped: S[] = [...ungrouped];
  for (const group of groups.values()) {
    group.sort((a, b) => b.startedAt - a.startedAt);
    deduped.push(group[0]); // oldest duplicates are dropped entirely
  }

  return deduped.filter(
    (s) =>
      !(
        s.status === "done" &&
        !isAlive(s.pid) &&
        Date.now() - s.lastActivity > 60_000
      ),
  );
}

function updateTray() {
  if (!trayIconCtrl) return;
  const sessions = getActiveSessions();
  trayIconCtrl.update(sessions, showBadgeCount);
}

async function resizeToContent(
  win: BrowserWindow,
  maxHeight: number,
  onHeight: (h: number) => void,
) {
  if (!win || win.isDestroyed()) return;
  try {
    // Returns [height, flag] where flag: true=settings (uncapped), 'collapsed'=header-only (no floor)
    const [h, flag] = await win.webContents.executeJavaScript(
      "(function(){" +
        '  var hdr = document.getElementById("header");' +
        '  var sp  = document.getElementById("settings-panel");' +
        '  var hp  = document.getElementById("history-panel");' +
        '  var ses = document.getElementById("sessions");' +
        "  var hh  = hdr ? hdr.offsetHeight : 0;" +
        // When collapsed: no sessions, settings, or history panel — just the header bar
        "  if (!sp && !hp && !ses) return [hh + 8, 'collapsed'];" +
        // Settings panel has no flex-1 so scrollHeight is reliable; never cap it
        "  if (sp) return [hh + sp.scrollHeight + 24, true];" +
        // For sessions and history: flex-1 stretches the container to fill the window,
        // so scrollHeight reports the window height rather than the content height.
        // Sum children directly: gap-4 (16px) for history, gap-1.5 (6px) for sessions,
        // plus pt-1.5 top-only padding (6px) for sessions.
        "  function contentH(el, gap) {" +
        "    if (!el) return 0;" +
        "    var kids = el.children, h = 6, c = 0;" +
        "    for (var i = 0; i < kids.length; i++) {" +
        "      var pos = getComputedStyle(kids[i]).position;" +
        '      if (pos === "absolute" || pos === "fixed") continue;' +
        "      h += kids[i].offsetHeight + (c > 0 ? gap : 0);" +
        "      c++;" +
        "    }" +
        "    return h;" +
        "  }" +
        // History panel children include flex-1/overflow-y:auto scroll containers.
        // For those, scrollHeight equals clientHeight when content is shorter than
        // the flex-allocated height — so we recurse into their children instead.
        "  function contentScrollH(el) {" +
        "    if (!el) return 0;" +
        "    var kids = el.children, h = 12, c = 0;" +
        "    for (var i = 0; i < kids.length; i++) {" +
        "      var cs = getComputedStyle(kids[i]);" +
        '      if (cs.position === "absolute" || cs.position === "fixed") continue;' +
        "      var childH;" +
        '      if (cs.overflowY === "auto" || cs.overflowY === "scroll") {' +
        "        var inner = kids[i].children, ih = 0, ic = 0;" +
        "        var gap = parseFloat(cs.rowGap) || 0;" +
        "        var pt = parseFloat(cs.paddingTop) || 0;" +
        "        var pb = parseFloat(cs.paddingBottom) || 0;" +
        "        for (var j = 0; j < inner.length; j++) {" +
        "          var ics = getComputedStyle(inner[j]);" +
        '          if (ics.position === "absolute" || ics.position === "fixed") continue;' +
        "          ih += inner[j].offsetHeight + (ic > 0 ? gap : 0); ic++;" +
        "        }" +
        "        childH = ih + pt + pb;" +
        "      } else {" +
        "        childH = kids[i].scrollHeight;" +
        "      }" +
        "      h += childH + (c > 0 ? 8 : 0); c++;" +
        "    }" +
        "    return h;" +
        "  }" +
        "  if (hp) return [hh + contentScrollH(hp) + 24, false];" +
        "  return [hh + contentH(ses, 6) + 8, false];" +
        "})()",
    );
    const isSettings = flag === true;
    const cap = isSettings ? 2400 : maxHeight;
    const floor = flag === 'collapsed' ? 0 : (currentViewMode !== 'card' ? 60 : 120);
    const clamped = Math.max(floor, Math.min(Math.ceil(h), cap));
    onHeight(clamped);
    const [width] = win.getSize();
    isProgrammaticResize = true;
    // When collapsed, temporarily remove the minimum-height constraint so the window
    // can shrink to header-only height; restore it when expanded.
    if (flag === 'collapsed') {
      win.setMinimumSize(currentMinWidth, 0);
    } else {
      const minH = currentViewMode !== 'card' ? MIN_HEIGHT_COMPACT : MIN_HEIGHT_CARD;
      win.setMinimumSize(currentMinWidth, minH);
    }
    win.setSize(Math.max(width, currentMinWidth), clamped);
    isProgrammaticResize = false;
  } catch {
    /* ignore if popover not ready */
  }
}

function checkNotifications() {
  const config = readConfig(CONFIG_FILE);
  const sessions = getActiveSessions();
  const currentIds = new Set(sessions.map((s) => s.sessionId));

  for (const s of sessions) {
    const prev = prevStatusMap.get(s.sessionId);
    const curr = s.status;

    if (prev !== undefined && prev !== curr) {
      const wantsNotif = config.notifications ?? true;
      const wantsSound = config.notificationSound ?? true;

      if (curr === "waiting_permission") {
        if (wantsSound) shell.beep();
        if (wantsNotif)
          new Notification({
            title: "Permission needed",
            body: `${s.dirName}: tool approval required`,
            silent: true,
          }).show();
      } else if (curr === "waiting_input") {
        if (wantsSound) shell.beep();
        if (wantsNotif)
          new Notification({
            title: "Input needed",
            body: `${s.dirName}: Claude asked a question`,
            silent: true,
          }).show();
      } else if (curr === "done" && prev !== "done") {
        if (wantsNotif)
          new Notification({
            title: "Session done",
            body: `${s.dirName}: task completed`,
            silent: true,
          }).show();
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
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "true",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
  GIT_OPTIONAL_LOCKS: "0",
};

function queryGitSummary(cwd: string): string | null {
  try {
    const raw = execFileSync("git", ["diff", "--shortstat", "HEAD"], {
      cwd,
      env: GIT_ENV,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3000,
    })
      .toString()
      .trim();
    if (!raw) return null;
    const files = raw.match(/(\d+) files? changed/);
    const ins = raw.match(/(\d+) insertion/);
    const del = raw.match(/(\d+) deletion/);
    const parts: string[] = [];
    if (files) parts.push(`${files[1]} files`);
    if (ins) parts.push(`+${ins[1]}`);
    if (del) parts.push(`-${del[1]}`);
    return parts.length > 0 ? parts.join(" ") : null;
  } catch {
    return null;
  }
}

function queryGitAhead(cwd: string): number | null {
  try {
    const raw = execFileSync("git", ["rev-list", "@{u}..HEAD", "--count"], {
      cwd,
      env: GIT_ENV,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3000,
    })
      .toString()
      .trim();
    const n = parseInt(raw, 10);
    return isNaN(n) || n === 0 ? null : n;
  } catch {
    return null;
  }
}

function refreshGitInfo() {
  const all = readSessions(SESSIONS_FILE);
  if (all.length === 0) return;

  const aheadCache = new Map<string, number | null>();
  const summaryCache = new Map<string, string | null>();
  const getAhead = (dir: string) => {
    if (!aheadCache.has(dir)) aheadCache.set(dir, queryGitAhead(dir));
    return aheadCache.get(dir)!;
  };
  const getSummary = (dir: string) => {
    if (!summaryCache.has(dir)) summaryCache.set(dir, queryGitSummary(dir));
    return summaryCache.get(dir)!;
  };

  let changed = false;
  const updated = all.map((s) => {
    if (!s.workingDir) return s;
    const nextSummary = getSummary(s.workingDir);
    const nextAhead = s.status === "done" ? getAhead(s.workingDir) : s.gitAhead;
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
    s.status === "waiting_permission"
      ? 0
      : s.status === "waiting_input"
        ? 1
        : s.status === "active"
          ? 2
          : s.status === "idle"
            ? 3
            : 4;
  const sorted = [...sessions]
    .sort((a, b) => priority(a) - priority(b) || b.lastActivity - a.lastActivity)
    .map((s) => ({ ...s, appName: s.appName ?? getAppName(s.pid) }));
  return {
    sessions: sorted,
    cardConfig: {
      showBranch: config.columns.gitBranch,
      showGitSummary: config.columns.changedFiles,
      showSubagents: config.columns.subagents,
      showModel: config.columns.lastAction,
      compactPaths: config.columns.compactPaths ?? true,
      showCost: config.columns.cost ?? false,
      showDoneFooter: config.columns.doneFooter ?? true,
      showContextInMeta: config.columns.contextInHeader ?? false,
      footerStyle: config.columns.footerStyle ?? 'default',
      theme: config.theme ?? "light",
      pinnedPanelOpacity: config.pinnedPanelOpacity ?? 1,
      collapsedAlwaysOpaque: config.collapsedAlwaysOpaque ?? false,
      modelColors: config.modelColors ?? {},
    },
    home: os.homedir(),
  };
}

function sendSessionsToPopover() {
  const payload = buildSessionsPayload();
  if (popover && !popover.isDestroyed())
    popover.webContents.send("sessions-update", payload);
  if (detachedPanel && !detachedPanel.isDestroyed())
    detachedPanel.webContents.send("sessions-update", payload);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

function readContextTokensFromTranscript(
  transcriptPath: string,
): { contextTokens: number; modelId: string } | null {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]) as Record<string, unknown>;
        const msg = (entry.message ?? {}) as Record<string, unknown>;
        if (entry.type === 'assistant' && typeof msg.model === 'string' && msg.model !== '<synthetic>') {
          const u = (msg.usage ?? {}) as Record<string, unknown>;
          const cr = typeof u.cache_read_input_tokens === 'number' ? u.cache_read_input_tokens : 0;
          const cw = typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0;
          const ct = (typeof u.input_tokens === 'number' ? u.input_tokens : 0) + cr + cw;
          return ct > 0 ? { contextTokens: ct, modelId: msg.model } : null;
        }
      } catch { /* skip malformed line */ }
    }
  } catch { /* file unreadable */ }
  return null;
}

function litellmModelToPrefix(modelId: string): string | null {
  const m = modelId.match(/^(claude-(?:opus|sonnet|haiku)-\d+)/);
  return m ? m[1] : null;
}

async function fetchAndCacheLiteLLMPricing(): Promise<void> {
  const https = await import('https');
  const url = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as Record<string, Record<string, unknown>>;
          const byPrefix: Record<string, { minor: number; entry: import('@claude-dashboard/shared').ModelPricingEntry }> = {};
          const byPrefixCtx: Record<string, { minor: number; contextWindow: number }> = {};
          for (const [modelId, v] of Object.entries(json)) {
            if (!modelId.startsWith('claude-')) continue;
            const prefix = litellmModelToPrefix(modelId);
            if (!prefix) continue;
            const minorMatch = modelId.match(/claude-(?:opus|sonnet|haiku)-\d+-(\d+)/);
            const minor = minorMatch ? parseInt(minorMatch[1], 10) : 0;

            const inp = typeof v.input_cost_per_token === 'number' ? v.input_cost_per_token * 1_000_000 : null;
            const out = typeof v.output_cost_per_token === 'number' ? v.output_cost_per_token * 1_000_000 : null;
            const cw  = typeof v.cache_creation_input_token_cost === 'number' ? v.cache_creation_input_token_cost * 1_000_000 : null;
            const cr  = typeof v.cache_read_input_token_cost === 'number' ? v.cache_read_input_token_cost * 1_000_000 : null;
            if (inp != null && out != null) {
              const existing = byPrefix[prefix];
              if (!existing || minor > existing.minor) {
                byPrefix[prefix] = {
                  minor,
                  entry: {
                    input: Math.round(inp * 10000) / 10000,
                    output: Math.round(out * 10000) / 10000,
                    cacheWrite: Math.round((cw ?? inp * 1.25) * 10000) / 10000,
                    cacheRead: Math.round((cr ?? inp * 0.1) * 10000) / 10000,
                  },
                };
              }
            }

            const ctx = typeof v.max_input_tokens === 'number' ? v.max_input_tokens : null;
            if (ctx != null) {
              const existingCtx = byPrefixCtx[prefix];
              if (!existingCtx || minor > existingCtx.minor) {
                byPrefixCtx[prefix] = { minor, contextWindow: ctx };
              }
            }
          }
          const fetched: Record<string, import('@claude-dashboard/shared').ModelPricingEntry> = {};
          for (const [prefix, { entry }] of Object.entries(byPrefix)) {
            fetched[prefix] = entry;
          }
          const fetchedCtx: Record<string, number> = {};
          for (const [prefix, { contextWindow }] of Object.entries(byPrefixCtx)) {
            fetchedCtx[prefix] = contextWindow;
          }
          if (Object.keys(fetched).length === 0 && Object.keys(fetchedCtx).length === 0) { resolve(); return; }
          const current = readConfig(CONFIG_FILE);
          const fetchedAt = Date.now();
          const updated = {
            ...current,
            modelPricing: {
              custom: current.modelPricing?.custom ?? [],
              ...current.modelPricing,
              fetched,
              fetchedAt,
            },
            modelContextWindows: {
              custom: current.modelContextWindows?.custom ?? [],
              ...current.modelContextWindows,
              fetched: fetchedCtx,
              fetchedAt,
            },
          };
          fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
        } catch {
          // Silently ignore — old cached data remains
        }
        resolve();
      });
      res.on('error', () => resolve());
    }).on('error', () => resolve());
  });
}

app.whenReady().then(() => {
  app.setName('Claude Agent Dashboard');
  installHook();

  // Hide from dock — this is a menu bar only app
  if (app.dock) app.dock.hide();

  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  trayIconCtrl = new TrayIconController(tray);
  tray.on("right-click", () => {
    tray!.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: "Quit Claude Dashboard", click: () => app.quit() },
      ]),
    );
  });

  let cfg = readConfig(CONFIG_FILE);
  const now = Date.now();
  const fetchedAt = cfg.modelPricing?.fetchedAt ?? 0;
  const contextWindowsEmpty = Object.keys(cfg.modelContextWindows?.fetched ?? {}).length === 0;
  if (now - fetchedAt > 24 * 60 * 60 * 1000 || contextWindowsEmpty) {
    fetchAndCacheLiteLLMPricing().catch(() => {});
  }
  let MAX_HEIGHT = cfg.maxHeight ?? 700;
  showBadgeCount = cfg.showBadgeCount ?? false;
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
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (isDev) {
    popover.loadURL("http://localhost:5173");
  } else {
    popover.loadFile(path.join(__dirname, "index.html"));
  }

  popover.on("will-resize", (event, newBounds) => {
    if (newBounds.width < currentMinWidth) event.preventDefault();
  });

  let resizeSaveTimer: ReturnType<typeof setTimeout> | null = null;
  popover.on("resize", () => {
    if (isProgrammaticResize) return;
    if (resizeSaveTimer) clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(() => {
      if (!popover || popover.isDestroyed()) return;
      const [w] = popover.getSize();
      if (currentViewMode !== 'card') windowState.compactWidth = w;
      else windowState.cardWidth = w;
      writeWindowState(windowState);
    }, 500);
  });

  const doResize = (win?: BrowserWindow) => {
    const target = win ?? popover;
    if (!target || target.isDestroyed()) return;
    const isPopover = target === popover;
    resizeToContent(target, MAX_HEIGHT, (h) => {
      if (isPopover) cachedHeight = h;
    });
  };

  // Render sessions as soon as the popover is ready so cachedHeight is known before first click
  popover.webContents.on("did-finish-load", async () => {
    if (isDev) popover?.webContents.openDevTools({ mode: "detach" });
    sendSessionsToPopover();
    setTimeout(doResize, 100);
  });

  tray.on("click", () => {
    if (detachedPanel && !detachedPanel.isDestroyed()) {
      if (detachedPanel.isMinimized()) detachedPanel.restore();
      detachedPanel.show();
      detachedPanel.focus();
      return;
    }
    if (!popover || popover.isDestroyed()) return;
    if (popover.isVisible()) {
      popover.hide();
    } else {
      const bounds = tray!.getBounds();
      const preferredWidth = currentViewMode !== 'card'
        ? windowState.compactWidth
        : windowState.cardWidth;
      // Pre-size to cached height before showing to avoid flash of full-height window
      isProgrammaticResize = true;
      popover.setBounds({
        x: Math.round(
          bounds.x - Math.round(preferredWidth / 2) + bounds.width / 2,
        ),
        y: Math.round(bounds.y + bounds.height),
        width: preferredWidth,
        height: cachedHeight,
      });
      isProgrammaticResize = false;
      sendSessionsToPopover();
      popover.show();
      popover.focus();
      setTimeout(doResize, 100);
    }
  });

  popover.on("blur", () => popover?.hide());

  ipcMain.on(
    "focus-terminal",
    (_event, pid: number, termSessionId: string | null) => {
      focusTerminal(pid, termSessionId);
      popover?.hide();
    },
  );

  ipcMain.handle("get-app-version", () => app.getVersion());

  ipcMain.handle("get-config", () => readConfig(CONFIG_FILE));

  ipcMain.handle("save-config", (_event, partial: Record<string, unknown>) => {
    const current = readConfig(CONFIG_FILE);
    const partialPricing = partial.modelPricing as typeof current.modelPricing | undefined;
    const partialContextWindows = partial.modelContextWindows as typeof current.modelContextWindows | undefined;
    const updated = {
      ...DEFAULT_CONFIG,
      ...current,
      ...partial,
      columns: {
        ...DEFAULT_CONFIG.columns,
        ...current.columns,
        ...((partial.columns as object) ?? {}),
      },
      modelPricing: partialPricing != null
        ? { ...(current.modelPricing ?? { fetched: {}, custom: [] }), ...partialPricing }
        : current.modelPricing,
      modelContextWindows: partialContextWindows != null
        ? { ...(current.modelContextWindows ?? { fetched: {}, custom: [] }), ...partialContextWindows }
        : current.modelContextWindows,
    };
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
    MAX_HEIGHT = updated.maxHeight ?? 700;
    showBadgeCount = updated.showBadgeCount ?? false;
    if (detachedPanel && !detachedPanel.isDestroyed() && !isDetachedOpaque) {
      detachedPanel.setOpacity(updated.pinnedPanelOpacity ?? 1);
    }
    updateTray();
    // When context window overrides change, recalculate contextPct for all sessions
    // immediately so cards update without waiting for the next Claude Code event.
    if (partialContextWindows != null) {
      const allSessions = readSessions(SESSIONS_FILE);
      let changed = false;
      for (const s of allSessions) {
        // Sessions created before contextTokens/modelId were added lack these fields.
        // Fall back to reading them directly from the transcript.
        if ((s.contextTokens == null || s.modelId == null) && s.transcriptPath) {
          const fromTranscript = readContextTokensFromTranscript(s.transcriptPath);
          if (fromTranscript) {
            s.contextTokens = fromTranscript.contextTokens;
            s.modelId = fromTranscript.modelId;
            changed = true;
          }
        }
        if (s.contextTokens != null && s.modelId != null) {
          const windowSize = modelContextWindowFromConfig(s.modelId, updated);
          const newPct = Math.min(100, Math.round((s.contextTokens / windowSize) * 100));
          if (s.contextPct !== newPct) {
            s.contextPct = newPct;
            changed = true;
          }
        }
      }
      if (changed) writeSessions(SESSIONS_FILE, allSessions);
    }
    sendSessionsToPopover();
  });

  ipcMain.handle("refresh-pricing", async () => {
    await fetchAndCacheLiteLLMPricing();
    return readConfig(CONFIG_FILE).modelPricing;
  });

  ipcMain.handle("refresh-context-windows", async () => {
    await fetchAndCacheLiteLLMPricing();
    return readConfig(CONFIG_FILE).modelContextWindows;
  });

  ipcMain.handle("get-history", () => readHistory(HISTORY_FILE));

  ipcMain.handle("uninstall", () => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
        if (settings.hooks) {
          for (const event of Object.keys(settings.hooks)) {
            settings.hooks[event] = (settings.hooks[event] as unknown[]).filter(
              (h) => !isDashboardHook(h),
            );
            if ((settings.hooks[event] as unknown[]).length === 0)
              delete settings.hooks[event];
          }
          if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      }
    } catch {}
    app.quit();
  });

  ipcMain.on("resize-to-fit", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    setTimeout(() => doResize(win), 50);
  });

  ipcMain.on("dismiss-session", (_event, sessionId: string) => {
    const all = readSessions(SESSIONS_FILE);
    const toArchive = all.filter((s) => s.sessionId === sessionId);
    if (toArchive.length > 0) appendHistory(HISTORY_FILE, toArchive);
    writeSessions(
      SESSIONS_FILE,
      all.filter((s) => s.sessionId !== sessionId),
    );
  });

  ipcMain.on("open-detached-panel", () => {
    if (detachedPanel && !detachedPanel.isDestroyed()) {
      detachedPanel.focus();
      return;
    }
    const panelW = windowState.panelWidth ?? currentMinWidth;
    const panelH = windowState.panelHeight ?? MAX_HEIGHT;
    detachedPanel = new BrowserWindow({
      width: panelW,
      height: panelH,
      ...(windowState.panelX != null && windowState.panelY != null
        ? { x: windowState.panelX, y: windowState.panelY }
        : {}),
      minWidth: currentMinWidth,
      minHeight: MIN_HEIGHT_COMPACT,
      show: true,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      transparent: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    if (isDev) {
      detachedPanel.loadURL("http://localhost:5173/#detached");
    } else {
      detachedPanel.loadFile(path.join(__dirname, "index.html"), {
        hash: "detached",
      });
    }
    detachedPanel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    detachedPanel.on("will-resize", (event, newBounds) => {
      if (newBounds.width < currentMinWidth) event.preventDefault();
    });

    let panelSaveTimer: ReturnType<typeof setTimeout> | null = null;
    const savePanelBounds = () => {
      if (panelSaveTimer) clearTimeout(panelSaveTimer);
      panelSaveTimer = setTimeout(() => {
        if (!detachedPanel || detachedPanel.isDestroyed()) return;
        const [x, y] = detachedPanel.getPosition();
        const [w, h] = detachedPanel.getSize();
        windowState.panelX = x;
        windowState.panelY = y;
        windowState.panelWidth = w;
        windowState.panelHeight = h;
        writeWindowState(windowState);
      }, 500);
    };
    detachedPanel.on("resize", () => {
      if (!isProgrammaticResize) savePanelBounds();
    });
    detachedPanel.on("move", savePanelBounds);

    const initialOpacity = readConfig(CONFIG_FILE).pinnedPanelOpacity ?? 1;
    detachedPanel.setOpacity(initialOpacity);

    detachedPanel.webContents.on("did-finish-load", () => {
      if (detachedPanel && !detachedPanel.isDestroyed()) {
        detachedPanel.webContents.send(
          "sessions-update",
          buildSessionsPayload(),
        );
      }
    });
    detachedPanel.on("closed", () => {
      stopDetachedHoverPoll();
      if (panelSaveTimer) clearTimeout(panelSaveTimer);
      detachedPanel = null;
    });
  });

  ipcMain.on("detached-hover", (_event, isHovered: boolean) => {
    isDetachedOpaque = isHovered;
    if (!detachedPanel || detachedPanel.isDestroyed()) return;
    if (isHovered) {
      stopDetachedHoverPoll();
      detachedPanel.setOpacity(1);
    } else {
      // The header's -webkit-app-region:drag suppresses mouse events, causing a
      // spurious mouseleave when the cursor moves from content into the drag region.
      // Verify the cursor actually left the window before going transparent.
      const cursor = screen.getCursorScreenPoint();
      const bounds = detachedPanel.getBounds();
      const inside =
        cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width &&
        cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height;
      if (inside) {
        // Cursor is in the drag region — stay opaque and poll for actual exit.
        stopDetachedHoverPoll();
        detachedHoverPoll = setInterval(() => {
          if (!detachedPanel || detachedPanel.isDestroyed() || isDetachedOpaque) {
            stopDetachedHoverPoll();
            return;
          }
          const cur = screen.getCursorScreenPoint();
          const b = detachedPanel.getBounds();
          const stillInside =
            cur.x >= b.x && cur.x < b.x + b.width &&
            cur.y >= b.y && cur.y < b.y + b.height;
          if (!stillInside) {
            stopDetachedHoverPoll();
            detachedPanel.setOpacity(readConfig(CONFIG_FILE).pinnedPanelOpacity ?? 1);
          }
        }, 50);
      } else {
        stopDetachedHoverPoll();
        detachedPanel.setOpacity(readConfig(CONFIG_FILE).pinnedPanelOpacity ?? 1);
      }
    }
  });

  ipcMain.handle("set-always-on-top", (event, value: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setAlwaysOnTop(value);
    win?.setVisibleOnAllWorkspaces(value, { visibleOnFullScreen: true });
  });

  ipcMain.on("set-view-mode", (_event, mode: ViewMode) => {
    currentViewMode = mode;
    currentMinWidth = mode !== 'card' ? MIN_WIDTH_COMPACT : MIN_WIDTH_CARD;
    const minH = mode !== 'card' ? MIN_HEIGHT_COMPACT : MIN_HEIGHT_CARD;
    isProgrammaticResize = true;
    for (const win of [popover, detachedPanel]) {
      if (!win || win.isDestroyed()) continue;
      win.setMinimumSize(currentMinWidth, minH);
      const [curW, h] = win.getSize();
      const targetW = Math.max(curW, currentMinWidth);
      win.setSize(targetW, h);
      if (mode !== 'card') windowState.compactWidth = targetW;
      else windowState.cardWidth = targetW;
    }
    writeWindowState(windowState);
    isProgrammaticResize = false;
  });

  // Debounced git refresh: coalesce rapid chokidar ticks into one git query
  let gitRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleGitRefresh = () => {
    if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
    gitRefreshTimer = setTimeout(refreshGitInfo, 2000);
  };

  const watcher = chokidar.watch([SESSIONS_FILE, CONFIG_FILE], {
    ignoreInitial: false,
  });
  watcher.on("add", updateTray);
  watcher.on("change", () => {
    const updatedCfg = readConfig(CONFIG_FILE);
    MAX_HEIGHT = updatedCfg.maxHeight ?? 700;
    showBadgeCount = updatedCfg.showBadgeCount ?? false;
    checkNotifications();
    updateTray();
    sendSessionsToPopover();
    setTimeout(doResize, 100);
    scheduleGitRefresh();
  });

  updateTray();
  gitRefreshInterval = setInterval(refreshGitInfo, 10_000);

  // Catch changes not triggered by file writes: dead processes (idle→done) and stale expiry.
  // Compare sessionId:status so status changes (not just adds/removes) trigger updates.
  let lastSessionSnapshot = "";
  sessionCheckInterval = setInterval(() => {
    const sessions = getActiveSessions();
    const snapshot = sessions
      .map((s) => `${s.sessionId}:${s.status}`)
      .sort()
      .join(",");
    if (snapshot !== lastSessionSnapshot) {
      lastSessionSnapshot = snapshot;
      sendSessionsToPopover();
      setTimeout(doResize, 100);
    }
    // Prune caches for pids no longer in any active session
    const activePids = new Set(sessions.map((s) => s.pid));
    const staleTs = Date.now() - 10_000;
    for (const [pid, entry] of isAliveCache) {
      if (!activePids.has(pid) || entry.ts < staleTs) isAliveCache.delete(pid);
    }
    for (const pid of appNameCache.keys()) {
      if (!activePids.has(pid)) appNameCache.delete(pid);
    }
  }, 5_000);
});

app.on("window-all-closed", () => {
  // keep running — menu bar app has no windows
});

app.on("before-quit", () => {
  if (gitRefreshInterval) clearInterval(gitRefreshInterval);
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);
  trayIconCtrl?.destroy();
  trayIconCtrl = null;
  tray?.destroy();
  tray = null;
});
