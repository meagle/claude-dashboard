#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_DIR="$HOME/.config/claude-dashboard"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "Installing dependencies..."
npm install

echo "Building Claude Session Dashboard..."
npm run build

echo "Installing hook..."
mkdir -p "$DASHBOARD_DIR"
cp packages/hook/dist/hook.js "$DASHBOARD_DIR/hook.js"

# Migrate data files from old location if they exist
if [ -d "$HOME/.claude/dashboard" ]; then
  for f in sessions.json config.json; do
    if [ -f "$HOME/.claude/dashboard/$f" ] && [ ! -f "$DASHBOARD_DIR/$f" ]; then
      cp "$HOME/.claude/dashboard/$f" "$DASHBOARD_DIR/$f"
      echo "Migrated $f from ~/.claude/dashboard/"
    fi
  done
fi

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

function mergeHook(hooks, event, entry) {
  if (!hooks[event]) {
    hooks[event] = [entry];
  } else {
    // Remove any existing claude-dashboard hook for this event, then add the new one
    hooks[event] = hooks[event].filter((h) => {
      // Old format: { command: "..." }
      if (h.command && h.command.includes('dashboard/hook.js')) return false;
      // New format: { matcher, hooks: [{ command: "..." }] }
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

echo "Installing launch script..."
PROJECT_DIR="$(pwd)"
LAUNCH_SCRIPT="$HOME/.local/bin/claude-dashboard"
mkdir -p "$HOME/.local/bin"
cat > "$LAUNCH_SCRIPT" << SCRIPT
#!/usr/bin/env bash
cd "$PROJECT_DIR" && npm start -w packages/menubar
SCRIPT
chmod +x "$LAUNCH_SCRIPT"

echo ""
echo "Installation complete."
echo "  Run the menu bar: claude-dashboard"
echo ""
echo "Hook registered for PreToolUse, PostToolUse, Stop, Notification."
