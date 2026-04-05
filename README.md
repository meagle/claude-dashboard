# Claude Session Dashboard

Real-time dashboard for monitoring multiple simultaneous Claude Code terminal sessions. Two surfaces: a terminal UI (TUI) for heads-down work and a macOS menu bar app for persistent at-a-glance status.

## What it looks like

**TUI (compact view):**
```
🤖 Claude Dashboard  •  3 sessions  •  2 active               04/05 14:32

 STATUS              PROJECT            TASK               TOOL      PROGRESS
 ──────────────────────────────────────────────────────────────────────────────
› ● active   12m      myapp [🌿 auth]    Fix auth bug       🔧 Bash   ████░░ 50%
             🤖 Explore (running) › searching src/auth/**            ±4 files
  🔐 WAITING  4m      api-service  main  Refactor DB layer  ⏸ needs approval
  ❓ INPUT    1m      payments     main  Add Stripe webhook  ⏸ awaiting answer
  ✅ done    32m      docs-site    main  Update API docs     last: Write • 5m

[d] detail   [x] dismiss   [C] clear done   [s] settings   [q] quit   [↑↓] navigate
```

**Menu bar:** Shows the highest-priority state across all sessions — `🔐 2` if any need approval, `❓ 1` if any need input, `🤖 3` while active, `✅` when all done. Click to open a session list popover.

## How it works

Every time Claude Code uses a tool, a hook fires and updates `~/.claude/dashboard/sessions.json`. The TUI and menu bar watch that file with chokidar and re-render instantly on change.

```
Claude session (any project)
  → PreToolUse / PostToolUse / Stop / Notification hooks fire
  → ~/.claude/dashboard/hook.js runs
  → writes/updates ~/.claude/dashboard/sessions.json (atomic)
  → TUI watches file → re-renders live
  → Menu bar watches file → updates tray icon + popover
```

Each session tracks: status, current tool, current task, task progress, running subagents, git branch, worktree, changed files, elapsed time, and cost.

**Statuses:**
| Icon | Status | Meaning |
|------|--------|---------|
| `● active` | active | Claude is running a tool |
| `🔐 WAITING` | waiting_permission | Tool approval needed in terminal |
| `❓ INPUT` | waiting_input | Claude asked a question |
| `○ idle` | idle | Between tool calls |
| `✅ done` | done | Session finished |

**Loop detection:** If the same tool fires 5+ times consecutively with no task state change, the session is flagged with a `🔴` error badge.

**Stale sessions** (no activity for 30 minutes) are pruned automatically on read — no cleanup needed.

## Requirements

- Node.js 18+
- macOS (menu bar uses AppleScript for terminal focus; TUI works anywhere)
- Claude Code installed

## Installation

```bash
git clone <this-repo> claude-dashboard
cd claude-dashboard
bash scripts/install.sh
```

The install script:
1. Builds all packages (`npm run build`)
2. Copies the compiled hook to `~/.claude/dashboard/hook.js`
3. Symlinks the `claude-dashboard` binary globally (`npm link`)
4. Merges the four hooks into `~/.claude/settings.json` (preserves any existing hooks)

`~/.claude/settings.json` is Claude Code's global user settings file — it applies to every Claude session on your machine, so once installed, the dashboard observes all new sessions automatically with no per-project setup.

**What gets added to `~/.claude/settings.json`:**
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

## Running

**TUI:**
```bash
claude-dashboard
```

**Menu bar:**
```bash
npm start -w packages/menubar
```

The menu bar app runs persistently in the background. Click the tray icon to see all sessions. Click a session row to bring that terminal window to focus. Click "Open Dashboard TUI" to launch the TUI in a new terminal.

## Configuration

Edit `~/.claude/dashboard/config.json` to control what's shown. Changes take effect immediately — no restart needed. Press `s` in the TUI to open it in `$EDITOR`.

```json
{
  "columns": {
    "elapsedTime": true,
    "gitBranch": true,
    "changedFiles": true,
    "cost": false,
    "subagents": true,
    "lastAction": true
  },
  "staleSessionMinutes": 30,
  "theme": "dark"
}
```

## Keyboard shortcuts (TUI)

| Key | Action |
|-----|--------|
| `d` | Toggle compact ↔ detail view |
| `↑` / `↓` | Navigate sessions |
| `x` | Dismiss selected completed session |
| `C` | Clear all done sessions |
| `s` | Open `config.json` in `$EDITOR` |
| `q` / `Ctrl+C` | Quit |

## Project structure

```
packages/
  shared/     Session types, sessions.json I/O, config reader
  hook/       Claude Code hook script (compiled to ~/.claude/dashboard/hook.js)
  tui/        Ink terminal UI  →  claude-dashboard binary
  menubar/    Electron tray app
scripts/
  install.sh  Build + install
```

## Development

```bash
npm install
npm test          # run all tests (47 tests across 4 packages)
npm run build     # compile all packages
```

The hook runs in-process during tests — no live Claude session needed to test it.

## Uninstalling

Remove the hooks from `~/.claude/settings.json` (the four entries added by install), then:

```bash
npm unlink -g @claude-dashboard/tui
rm -rf ~/.claude/dashboard
```
