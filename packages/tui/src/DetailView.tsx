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

interface CardProps {
  session: Session;
  config: DashboardConfig;
  isSelected: boolean;
}

function SessionCard({ session, config, isSelected }: CardProps) {
  const elapsed = elapsedStr(Date.now() - session.startedAt);
  const branchLabel = session.worktree
    ? `[🌿 ${session.worktree}]`
    : session.branch ?? '';

  const completedTasks = session.tasks.filter((t) => t.status === 'completed').length;
  const inProgressTasks = session.tasks.filter((t) => t.status === 'in_progress').length;
  const pendingTasks = session.tasks.filter((t) => t.status === 'pending').length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isSelected ? 'green' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <StatusBadge status={session.status} errorState={session.errorState} />
        <Text dimColor> {elapsed}  </Text>
        <Text bold>{session.dirName}</Text>
        <Text dimColor>  {session.workingDir}  </Text>
        <Text dimColor>{branchLabel}</Text>
      </Box>

      {session.currentTask && (
        <Text>📋 {session.currentTask}</Text>
      )}

      {session.status === 'waiting_permission' && (
        <Text color="red">⚠️  Waiting for tool approval in terminal</Text>
      )}
      {session.status === 'waiting_input' && (
        <Text color="yellow">⚠️  Awaiting answer in terminal</Text>
      )}

      {session.tasks.length > 0 && (
        <Box>
          <Text>Tasks:  ✅ {completedTasks}  🔄 {inProgressTasks}  ⏳ {pendingTasks}  </Text>
          <Box>
            <Text>[</Text>
            <ProgressBar pct={session.completionPct} width={12} />
            <Text>] {session.completionPct}%</Text>
          </Box>
          {config.columns.changedFiles && session.changedFiles !== null && (
            <Text dimColor>   ±{session.changedFiles} files</Text>
          )}
        </Box>
      )}

      {(session.currentTool || session.subagents.some((a) => a.status === 'running')) && (
        <Box>
          {session.currentTool && <Text>🔧 {session.currentTool}  </Text>}
          {session.subagents
            .filter((a) => a.status === 'running')
            .map((a) => (
              <Text key={a.id}>🤖 {a.type} (running)</Text>
            ))}
        </Box>
      )}

      {config.columns.cost && session.costUsd !== null && (
        <Text dimColor>~${session.costUsd.toFixed(2)}</Text>
      )}
    </Box>
  );
}

interface Props {
  sessions: Session[];
  selectedIdx: number;
  config: DashboardConfig;
}

export function DetailView({ sessions, selectedIdx, config }: Props) {
  if (sessions.length === 0) {
    return <Text dimColor>no sessions found</Text>;
  }

  return (
    <Box flexDirection="column">
      {sessions.map((session, idx) => (
        <SessionCard
          key={session.sessionId}
          session={session}
          config={config}
          isSelected={idx === selectedIdx}
        />
      ))}
    </Box>
  );
}
