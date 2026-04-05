import React from 'react';
import { Box, Text } from 'ink';
import { Session, DashboardConfig } from '@claude-dashboard/shared';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';

function elapsedStr(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h${mins % 60}m`;
  return `${mins}m`;
}

function lastActionStr(session: Session): string {
  if (session.currentTool) return `🔧 ${session.currentTool}`;
  if (session.lastTool && session.lastToolAt) {
    const ago = elapsedStr(Date.now() - session.lastToolAt);
    return `last: ${session.lastTool} • ${ago}`;
  }
  return '';
}

interface Props {
  sessions: Session[];
  selectedIdx: number;
  config: DashboardConfig;
}

export function CompactTable({ sessions, selectedIdx, config }: Props) {
  if (sessions.length === 0) {
    return <Text dimColor>no sessions found</Text>;
  }

  return (
    <Box flexDirection="column">
      {sessions.map((session, idx) => {
        const elapsed = elapsedStr(Date.now() - session.startedAt);
        const isSelected = idx === selectedIdx;

        const branchLabel = session.worktree
          ? ` [🌿 ${session.worktree}]`
          : session.branch
          ? ` ${session.branch}`
          : '';

        const activeSubagents = session.subagents.filter((a) => a.status === 'running');

        return (
          <Box key={session.sessionId} flexDirection="column">
            <Box>
              <Text bold={isSelected}>{isSelected ? '›' : ' '} </Text>
              <Box width={22}>
                <StatusBadge status={session.status} errorState={session.errorState} />
                <Text dimColor> {elapsed}</Text>
              </Box>
              <Box width={22}>
                <Text bold>{session.dirName}</Text>
                <Text dimColor>{branchLabel}</Text>
              </Box>
              <Box width={28}>
                <Text>{session.currentTask ?? ''}</Text>
              </Box>
              <Box width={14}>
                <Text>{lastActionStr(session)}</Text>
              </Box>
              <Box>
                {session.tasks.length > 0 && (
                  <>
                    <ProgressBar pct={session.completionPct} width={6} />
                    <Text> {session.completionPct}%</Text>
                  </>
                )}
                {config.columns.changedFiles && session.changedFiles !== null && (
                  <Text dimColor>  ±{session.changedFiles} files</Text>
                )}
                {config.columns.cost && session.costUsd !== null && (
                  <Text dimColor>  ~${session.costUsd.toFixed(2)}</Text>
                )}
              </Box>
            </Box>
            {config.columns.subagents &&
              activeSubagents.map((agent) => (
                <Box key={agent.id} marginLeft={4}>
                  <Text dimColor>🤖 {agent.type} (running)</Text>
                </Box>
              ))}
          </Box>
        );
      })}
    </Box>
  );
}
