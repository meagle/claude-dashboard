# Claude Session Dashboard — Design Spec
_2026-04-05_

## Overview

A real-time dashboard for monitoring multiple simultaneous Claude Code terminal sessions. Provides two surfaces: a terminal UI (TUI) for heads-down work and a macOS menu bar app for persistent at-a-glance status.

---

## Architecture

### State Flow

```
Claude session (any project)
  → PreToolUse / PostToolUse / Stop hooks fire
  → ~/.claude/dashboard/hook.ts executes
  → writes/updates ~/.claude/dashboard/sessions.json
  → TUI (Ink) watches file → re-renders live
  → Menu bar (Electron tray) watches file → updates icon + popover
  → Both also watch ~/.claude/dashboard/config.json → reload prefs on change
```

### Shared State File

`~/.claude/dashboard/sessions.json` — array of session objects, keyed by `sessionId`. The hook script upserts entries; stale sessions (no `lastActivity` in 30 min) are pruned by the TUI and menu bar on read — not by the hook, since the hook may never fire again if a session crashes.

### Session State Shape

```typescript
interface Session {
  sessionId: string;        // from $CLAUDE_SESSION_ID env var
  pid: number;              // process ID (for terminal focus)
  workingDir: string;       // absolute path
  dirName: string;          // basename of workingDir
  branch: string | null;    // current git branch (always, not just worktrees)
  worktree: string | null;  // branch name if running inside a git worktree, null otherwise
  status: 'active' | 'waiting_permission' | 'waiting_input' | 'idle' | 'done';
  currentTool: string | null;       // e.g. "Bash", "Read", "Agent"
  lastTool: string | null;          // last tool used (shown when idle/done)
  lastToolAt: number | null;        // unix ms — used to show "last: Write • 2m ago"
  currentTask: string | null;       // subject of in_progress task
  tasks: TaskSummary[];
  subagents: SubagentSummary[];
  completionPct: number;            // derived: completed / total tasks
  changedFiles: number | null;      // from `git diff --stat` in workingDir, refreshed periodically
  costUsd: number | null;           // best-effort from history.jsonl; null if unavailable
  errorState: boolean;              // true if loop detection or hook-reported error
  startedAt: number;                // unix ms
  lastActivity: number;             // unix ms
  dismissed: boolean;               // true when user presses x on a done session
}

interface TaskSummary {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface SubagentSummary {
  id: string;
  type: string;   // e.g. "Explore", "Plan", "general-purpose"
  status: 'running' | 'done';
}
```

---

## Components

### 1. Hook Script (`~/.claude/dashboard/hook.ts`)

Compiled to `~/.claude/dashboard/hook.js`, invoked by Claude Code hooks.

**Reads from environment:**
- `CLAUDE_SESSION_ID` — session identifier
- `PWD` — working directory (standard env var; `CLAUDE_CWD` if Claude Code exposes it)
- Hook-provided JSON on stdin — tool name, task info, subagent info

**Behavior per hook:**
- `PreToolUse` — set `currentTool`, update `lastActivity`, set `status: active`
- `PostToolUse` — move `currentTool` → `lastTool`/`lastToolAt`, clear `currentTool`; if tool was TaskCreate/TaskUpdate parse task state from stdin
- `Stop` — set `status: done`, clear `currentTool`, attempt cost read from `history.jsonl`
- `Notification` — capture subagent spawn/complete events; detect permission prompts → `waiting_permission`, input requests → `waiting_input`

**Loop/error detection:** If the same tool fires more than 5 times consecutively with no task state change, set `errorState: true`.

**Claude Code settings.json hooks:**
```json
{
  "hooks": {
    "PreToolUse":   [{ "command": "node ~/.claude/dashboard/hook.js pre-tool" }],
    "PostToolUse":  [{ "command": "node ~/.claude/dashboard/hook.js post-tool" }],
    "Stop":         [{ "command": "node ~/.claude/dashboard/hook.js stop" }],
    "Notification": [{ "command": "node ~/.claude/dashboard/hook.js notification" }]
  }
}
```

**File writes:** Atomic — write to `sessions.json.tmp`, then rename to `sessions.json` to avoid partial reads.

---

### 2. Configuration (`~/.claude/dashboard/config.json`)

Controls which columns and data are shown. Watched by TUI and menu bar — changes take effect immediately without restart.

```json
{
  "columns": {
    "elapsedTime":   true,
    "gitBranch":     true,
    "changedFiles":  true,
    "cost":          false,
    "subagents":     true,
    "lastAction":    true
  },
  "staleSessionMinutes": 30,
  "theme": "dark"
}
```

Press `s` in the TUI to open `config.json` in `$EDITOR`.

---

### 3. TUI (`packages/tui`)

Built with **Ink** (React for terminal). Run with `claude-dashboard` (global bin).

#### Default View — Compact Table

```
🤖 Claude Dashboard  •  3 sessions  •  2 active               04/05 14:32

 STATUS              PROJECT            TASK               TOOL      PROGRESS
 ──────────────────────────────────────────────────────────────────────────────
 ● active   12m      myapp [🌿 auth]    Fix auth bug       🔧 Bash   ████░░ 50%
            🤖 Explore (running) › searching src/auth/**            ±4 files
 🔐 WAITING  4m      api-service  main  Refactor DB layer  ⏸ needs approval
 ❓ INPUT    1m      payments     main  Add Stripe webhook  ⏸ awaiting answer
 ✅ done    32m      docs-site    main  Update API docs     last: Write • 5m    ~$0.08

[d] detail   [x] dismiss   [C] clear done   [s] settings   [q] quit   [↑↓] navigate
```

**Status color coding:**
- `active` — green
- `waiting_permission` — red/bold with `🔐` prefix
- `waiting_input` — yellow with `❓` prefix
- `errorState` — red `🔴` badge appended to project name
- `idle` — dim orange
- `done` — dimmed; persists until dismissed with `x`

**Worktree indicator:** `[🌿 branch]` badge — visually distinct from a plain branch name, makes it unambiguous the session is inside a git worktree. Non-worktree sessions show branch name without the badge.

**Subagent rows:** Indented one level under their parent session when active.

**Changed files:** `±N files` shown inline when `changedFiles` config is enabled.

**Cost:** `~$N.NN` shown in done row when `cost` config is enabled (prefixed with `~` to signal estimate).

#### Detail View (toggle with `d`)

Each session expands to a card:

```
┌─ ● ACTIVE  12m ───────────────────────────────────────────────────────────┐
│  myapp   /Users/meagle/projects/myapp   [🌿 feature/auth]                 │
│  📋 Fix authentication bug in login flow                                   │
│                                                                            │
│  Tasks:  ✅ 3  🔄 1  ⏳ 2        [████████░░░░] 50%   ±4 files           │
│  🔧 Bash  •  🤖 Explore (running) › searching src/auth/**                 │
└────────────────────────────────────────────────────────────────────────────┘

┌─ 🔐 NEEDS APPROVAL  4m ───────────────────────────────────────────────────┐
│  api-service   /Users/meagle/projects/api-service   main                  │
│  📋 Refactor database layer                                                │
│  ⚠️  Waiting for tool approval in terminal                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `d` | Toggle compact ↔ detail view |
| `↑` / `↓` | Navigate sessions |
| `x` | Dismiss selected completed session |
| `C` | Clear all completed/done sessions |
| `s` | Open `config.json` in `$EDITOR` |
| `q` / `Ctrl+C` | Quit |

---

### 4. Menu Bar App (`packages/menubar`)

Built with **Electron** (tray API).

#### Icon States

| State | Icon | Priority |
|-------|------|----------|
| Any session needs permission approval | `🔐 N` | highest |
| Any session waiting on a question | `❓ N` | high |
| 1+ active sessions | `🤖 N` | normal |
| All done / idle (undismissed) | `✅` | low |
| No sessions | _(hidden or dimmed)_ | — |

Multiple states: highest priority wins (`🔐` > `❓` > `🤖`).

#### Click Popover

```
🤖 Claude Sessions

🔐 api-service   main    needs approval!
❓ payments      main    awaiting answer
● myapp  [🌿 auth]  50% ████░░░░   12m
✅ docs-site      done   5m ago    ~$0.08

─────────────────────────────────────────
Open Dashboard TUI
```

- Clicking a session row brings that terminal window to focus via AppleScript
- `🔐` and `❓` rows are sorted to the top regardless of start order
- "Open Dashboard TUI" launches the TUI in a new terminal window
- Cost shown per session when `cost` config enabled

---

## Project Structure

```
claude-dashboard/
  packages/
    hook/        hook.ts — Claude Code hook script
    tui/         Ink TUI app
    menubar/     Electron tray app
    shared/      SessionState types, sessions.json reader/writer, config reader
  scripts/
    install.sh   compiles hook, links bin, patches settings.json
```

Monorepo with npm workspaces. Each package has its own `tsconfig.json`.

---

## Tech Stack

| Concern | Library |
|---------|---------|
| TUI rendering | Ink + React |
| File watching | chokidar |
| Menu bar | Electron tray API |
| Terminal focus | AppleScript via `osascript` |
| TypeScript build | `tsc` + `tsx` for dev |

---

## Error Handling

- Hook script failures are silent (non-zero exit is suppressed) — Claude sessions must not be blocked by dashboard errors
- TUI shows "no sessions found" when `sessions.json` is missing or empty
- Stale sessions (no `lastActivity` past `staleSessionMinutes`) are pruned from state by the TUI/menu bar on read
- Atomic file writes prevent the TUI from reading partial state
- `changedFiles` derived from `git diff --stat` run in the working dir; silently omitted if dir is not a git repo or git is unavailable
- Cost from `history.jsonl` is best-effort; shown as `~$N.NN` with `~` prefix to signal approximation; omitted if data unavailable

---

## Out of Scope

- Remote/SSH session monitoring
- Historical session replay
- Push notifications / alerts
- Windows support
- In-TUI settings UI (config file + `$EDITOR` is sufficient for v1)
