import { execSync } from 'child_process';

export function buildAppleScript(pid: number): string {
  return `
tell application "System Events"
  set targetProcess to first process whose unix id is ${pid}
  set frontmost of targetProcess to true
end tell
activate application (name of first application process whose unix id is ${pid})
`.trim();
}

export function focusTerminalByPid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try {
    const script = buildAppleScript(pid);
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  } catch {
    // silently ignore
  }
}
