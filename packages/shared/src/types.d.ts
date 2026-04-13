export interface TaskSummary {
    id: string;
    subject: string;
    status: 'pending' | 'in_progress' | 'completed';
}
export interface SubagentSummary {
    id: string;
    type: string;
    status: 'running' | 'done';
}
export interface Session {
    sessionId: string;
    pid: number;
    termSessionId: string | null;
    workingDir: string;
    dirName: string;
    branch: string | null;
    worktree: string | null;
    status: 'active' | 'waiting_permission' | 'waiting_input' | 'idle' | 'done';
    currentTool: string | null;
    lastTool: string | null;
    lastToolAt: number | null;
    lastToolSummary: string | null;
    lastPrompt: string | null;
    lastMessage: string | null;
    currentTask: string | null;
    tasks: TaskSummary[];
    subagents: SubagentSummary[];
    completionPct: number;
    changedFiles: number | null;
    costUsd: number | null;
    turns: number | null;
    model: string | null;
    contextPct: number | null;
    bashStartedAt: number | null;
    gitSummary: string | null;
    transcriptPath: string | null;
    partialResponse: string | null;
    errorState: boolean;
    loopTool: string | null;
    loopCount: number;
    startedAt: number;
    turnStartedAt: number | null;
    lastActivity: number;
    dismissed: boolean;
}
export interface DashboardConfig {
    columns: {
        elapsedTime: boolean;
        gitBranch: boolean;
        changedFiles: boolean;
        cost: boolean;
        subagents: boolean;
        lastAction: boolean;
        compactPaths: boolean;
    };
    staleSessionMinutes: number;
    theme: 'dark' | 'light';
    notifications: boolean;
    notificationSound: boolean;
}
export declare const DEFAULT_CONFIG: DashboardConfig;
