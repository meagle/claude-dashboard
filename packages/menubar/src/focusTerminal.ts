import { spawnSync, execFileSync } from 'child_process';

export function sanitizeGuid(termSessionId: string): string {
  const raw = termSessionId.includes(':') ? termSessionId.split(':')[1] : termSessionId;
  return raw.replace(/[^a-zA-Z0-9\-_]/g, '');
}

// Known editor apps whose integrated terminals embed Claude sessions.
// Maps a substring of the process comm name to the macOS app name.
const KNOWN_EDITOR_APPS: Array<[string, string]> = [
  ['cursor', 'Cursor'],
  ['Cursor', 'Cursor'],
  ['Code Helper', 'Visual Studio Code'],
  ['Visual Studio Code', 'Visual Studio Code'],
];

// Walk up the process tree from pid looking for a known editor host app.
export function findParentApp(pid: number): string | null {
  try {
    let current = pid;
    for (let i = 0; i < 15; i++) {
      const out = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(current)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 1000,
      }).toString().trim();
      if (!out) break;
      const spaceIdx = out.search(/\s/);
      if (spaceIdx === -1) break;
      const ppid = parseInt(out.slice(0, spaceIdx), 10);
      const comm = out.slice(spaceIdx).trim();
      for (const [needle, appName] of KNOWN_EDITOR_APPS) {
        if (comm.includes(needle)) return appName;
      }
      if (!ppid || ppid <= 1) break;
      current = ppid;
    }
  } catch { }
  return null;
}

export function focusTerminal(pid: number, termSessionId: string | null): void {
  try {
    if (termSessionId) {
      const guid = sanitizeGuid(termSessionId);
      if (!guid) return;
      const script = `tell application "iTerm2"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if id of aSession is "${guid}" then
          select aWindow
          activate
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
      spawnSync('osascript', ['-'], { input: script, encoding: 'utf8' });
      return;
    }
    if (!Number.isSafeInteger(pid) || pid <= 0) return;
    const editorApp = findParentApp(pid);
    if (editorApp) {
      spawnSync('osascript', ['-e', `tell application "${editorApp}" to activate`]);
      return;
    }
    spawnSync('osascript', [
      '-e', 'tell application "System Events"',
      '-e', `set frontmost of (first process whose unix id is ${pid}) to true`,
      '-e', 'end tell',
    ]);
  } catch { }
}
