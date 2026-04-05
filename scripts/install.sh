#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_DIR="$HOME/.claude/dashboard"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "Building Claude Session Dashboard..."
npm run build

echo "Installing hook..."
mkdir -p "$DASHBOARD_DIR"
cp packages/hook/dist/hook.js "$DASHBOARD_DIR/hook.js"

echo "Symlinking TUI binary..."
npm link --workspace=packages/tui

echo "Patching Claude Code settings.json..."
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Use node to merge hooks into settings.json
node - <<'NODESCRIPT'
const fs = require('fs');
const file = process.env.HOME + '/.claude/settings.json';
const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
settings.hooks = settings.hooks || {};

function mergeHook(hooks, event, cmd) {
  if (!hooks[event]) {
    hooks[event] = [cmd];
  } else {
    // Remove any existing claude-dashboard hook for this event, then add the new one
    hooks[event] = hooks[event].filter(
      (h) => !h.command || !h.command.includes('dashboard/hook.js')
    );
    hooks[event].push(cmd);
  }
}

const hookCmd = (event) => ({ command: `node ~/.claude/dashboard/hook.js ${event}` });
mergeHook(settings.hooks, 'PreToolUse',   hookCmd('pre-tool'));
mergeHook(settings.hooks, 'PostToolUse',  hookCmd('post-tool'));
mergeHook(settings.hooks, 'Stop',         hookCmd('stop'));
mergeHook(settings.hooks, 'Notification', hookCmd('notification'));

fs.writeFileSync(file, JSON.stringify(settings, null, 2));
console.log('settings.json updated.');
NODESCRIPT

echo ""
echo "Installation complete."
echo "  Run the TUI:      claude-dashboard"
echo "  Run the menu bar: npm start -w packages/menubar"
echo ""
echo "Hook registered for PreToolUse, PostToolUse, Stop, Notification."
