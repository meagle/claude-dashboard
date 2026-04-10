import { spawnSync } from 'child_process';

export function focusTerminal(pid: number, termSessionId: string | null): void {
  try {
    if (termSessionId) {
      const guid = termSessionId.includes(':') ? termSessionId.split(':')[1] : termSessionId;
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
    spawnSync('osascript', [
      '-e', 'tell application "System Events"',
      '-e', `set frontmost of (first process whose unix id is ${pid}) to true`,
      '-e', 'end tell',
    ]);
  } catch { }
}
