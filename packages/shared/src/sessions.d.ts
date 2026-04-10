import { Session } from './types';
export declare function readSessions(filePath: string): Session[];
export declare function writeSessions(filePath: string, sessions: Session[]): void;
export declare function pruneStaleSessions(sessions: Session[], staleMinutes: number): Session[];
export declare function upsertSession(sessions: Session[], updated: Session): Session[];
