// Command-line substrings that identify a process as a coding agent whose hook
// events this dashboard understands. Used to guard against pid reuse: a
// session's pid may be recycled by the OS to an unrelated process after the
// original agent exits, so liveness checks confirm the pid still belongs to a
// known agent rather than trusting `kill(pid, 0)` alone.
const KNOWN_AGENT_PATTERN = /claude|cursor|codex/i;

export function isKnownAgentProcessArgs(args: string): boolean {
  return KNOWN_AGENT_PATTERN.test(args);
}
