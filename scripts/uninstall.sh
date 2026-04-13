#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_DIR="$HOME/.config/claude-dashboard"
SETTINGS_FILE="$HOME/.claude/settings.json"
LAUNCH_SCRIPT="$HOME/.local/bin/claude-dashboard"

echo "Uninstalling Claude Session Dashboard..."

echo "Removing hook entries from settings.json..."
if [ -f "$SETTINGS_FILE" ]; then
  node - <<'NODESCRIPT'
const fs = require('fs');
const file = process.env.HOME + '/.claude/settings.json';
const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
if (settings.hooks) {
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event].filter((h) => {
      if (h.command && h.command.includes('dashboard/hook.js')) return false;
      if (Array.isArray(h.hooks) && h.hooks.some((i) => i.command && i.command.includes('dashboard/hook.js'))) return false;
      return true;
    });
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}
fs.writeFileSync(file, JSON.stringify(settings, null, 2));
console.log('settings.json updated.');
NODESCRIPT
else
  echo "  settings.json not found, skipping."
fi

echo "Removing config directory..."
if [ -d "$DASHBOARD_DIR" ]; then
  rm -rf "$DASHBOARD_DIR"
  echo "  Removed $DASHBOARD_DIR"
else
  echo "  $DASHBOARD_DIR not found, skipping."
fi

echo "Removing launch script..."
if [ -f "$LAUNCH_SCRIPT" ]; then
  rm "$LAUNCH_SCRIPT"
  echo "  Removed $LAUNCH_SCRIPT"
else
  echo "  $LAUNCH_SCRIPT not found, skipping."
fi

echo ""
echo "Uninstall complete. Quit the menu bar app if it is still running."
