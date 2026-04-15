#!/usr/bin/env bash
# install-hook.sh — installs the Claude Dashboard hook without needing the full source build.
# Downloads hook.js from the latest GitHub release and wires it into ~/.claude/settings.json.
# Requires: curl, node (both are present if Claude Code is installed).
set -euo pipefail

DASHBOARD_DIR="$HOME/.config/claude-dashboard"
SETTINGS_FILE="$HOME/.claude/settings.json"
REPO="meagle/claude-dashboard"
HOOK_URL="https://github.com/${REPO}/releases/latest/download/hook.js"

echo "Downloading hook.js..."
mkdir -p "$DASHBOARD_DIR"
curl -fsSL "$HOOK_URL" -o "$DASHBOARD_DIR/hook.js"
echo "Installed to $DASHBOARD_DIR/hook.js"

echo "Patching Claude Code settings.json..."
if [ ! -f "$SETTINGS_FILE" ]; then
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  echo '{}' > "$SETTINGS_FILE"
fi

node - <<'NODESCRIPT'
const fs = require('fs');
const file = process.env.HOME + '/.claude/settings.json';
const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
settings.hooks = settings.hooks || {};

function mergeHook(hooks, event, entry) {
  if (!hooks[event]) {
    hooks[event] = [entry];
  } else {
    hooks[event] = hooks[event].filter((h) => {
      if (h.command && h.command.includes('dashboard/hook.js')) return false;
      if (Array.isArray(h.hooks) && h.hooks.some((i) => i.command && i.command.includes('dashboard/hook.js'))) return false;
      return true;
    });
    hooks[event].push(entry);
  }
}

const hookEntry = (arg) => ({
  matcher: '',
  hooks: [{ type: 'command', command: `node ~/.config/claude-dashboard/hook.js ${arg}` }],
});
mergeHook(settings.hooks, 'UserPromptSubmit', hookEntry('user-prompt'));
mergeHook(settings.hooks, 'PreToolUse',       hookEntry('pre-tool'));
mergeHook(settings.hooks, 'PostToolUse',      hookEntry('post-tool'));
mergeHook(settings.hooks, 'Stop',             hookEntry('stop'));
mergeHook(settings.hooks, 'Notification',     hookEntry('notification'));

fs.writeFileSync(file, JSON.stringify(settings, null, 2));
console.log('settings.json updated.');
NODESCRIPT

echo ""
echo "Hook installed. Launch Claude Dashboard from /Applications and start a Claude session to verify."
