// Re-exports the shared agent-process pattern used to guard pid-reuse checks —
// see packages/shared/src/agentProcess.ts for the pattern and rationale. Kept
// as a thin re-export so packages/menubar/src/main.ts's existing import path
// (`./knownAgentProcess`) doesn't need to change.
export { isKnownAgentProcessArgs } from '@claude-dashboard/shared';
