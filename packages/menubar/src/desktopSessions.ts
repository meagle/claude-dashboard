import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import chokidar, { FSWatcher } from "chokidar";
import type { Session } from "@claude-dashboard/shared";

const CLAUDE_LOG = path.join(
  os.homedir(),
  "Library",
  "Logs",
  "Claude",
  "main.log",
);
const DEBOUNCE_MS = 500;

function isClaudeRunning(): boolean {
  try {
    execFileSync("pgrep", ["-x", "Claude"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function buildPresenceSession(): Session | null {
  if (!isClaudeRunning()) return null;
  const now = Date.now();
  return {
    sessionId: "desktop-presence",
    pid: 0,
    termSessionId: null,
    workingDir: "",
    dirName: "Claude Desktop",
    branch: null,
    worktree: null,
    status: "idle",
    currentTool: null,
    lastTool: null,
    lastToolAt: null,
    lastToolSummary: null,
    lastPrompt: null,
    lastMessage: null,
    currentTask: null,
    tasks: [],
    subagents: [],
    completionPct: 0,
    changedFiles: null,
    costUsd: null,
    turns: null,
    toolCount: 0,
    totalTokens: null,
    model: null,
    modelId: null,
    contextPct: null,
    contextTokens: null,
    bashStartedAt: null,
    gitSummary: null,
    gitAhead: null,
    transcriptPath: null,
    partialResponse: null,
    errorState: false,
    loopTool: null,
    loopCount: 0,
    startedAt: now,
    turnStartedAt: null,
    lastActivity: now,
    dismissed: false,
    appName: "Claude Desktop",
    source: "desktop",
  };
}

export interface DesktopSessionWatcher {
  getSessions(): Session[];
  onChange(cb: () => void): void;
  destroy(): void;
}

export function createDesktopSessionWatcher(): DesktopSessionWatcher {
  const callbacks: Array<() => void> = [];
  let current: Session | null = buildPresenceSession();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function notify() {
    for (const cb of callbacks) cb();
  }

  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const next = buildPresenceSession();
      const changed = (current != null) !== (next != null);
      current = next;
      if (changed) notify();
    }, DEBOUNCE_MS);
  }

  // Watch the log file — its appearance/disappearance signals Desktop launching
  let logWatcher: FSWatcher | null = null;
  const logDir = path.dirname(CLAUDE_LOG);
  if (fs.existsSync(logDir)) {
    logWatcher = chokidar.watch(CLAUDE_LOG, {
      ignoreInitial: true,
      disableGlobbing: true,
    });
    logWatcher.on("add", schedule);
    logWatcher.on("unlink", schedule);
  }

  // Poll for process every 10s (only reliable way to detect quit)
  const pollInterval = setInterval(schedule, 10_000);

  return {
    getSessions(): Session[] {
      return current ? [current] : [];
    },
    onChange(cb: () => void): void {
      callbacks.push(cb);
    },
    destroy(): void {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(pollInterval);
      logWatcher?.close();
    },
  };
}
