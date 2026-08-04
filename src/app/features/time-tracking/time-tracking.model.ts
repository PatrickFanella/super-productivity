// Base mapped types with clearer names

// Re-export ArchiveModel for backward compatibility
export { ArchiveModel } from '../archive/archive.model';

export type TTModelId = string;
export type TTDate = string;

export type TTModelIdMap<T> = Omit<
  Record<TTModelId, T>,
  keyof TTWorkContextData | keyof TimeTrackingState | 'workStart' | 'workEnd'
>;
export type TTDateMap<T> = Omit<
  Record<TTDate, T>,
  keyof TTWorkContextData | keyof TimeTrackingState | 'workStart' | 'workEnd'
>;

/**
 * Time Tracking work context data
 * Uses shortened property names to reduce storage size
 * s: start time
 * e: end time
 * b: break number
 * bt: break time
 */
export interface TTWorkContextData {
  s?: number;
  e?: number;
  b?: number;
  bt?: number;
}

/*
project:
  [projectId]:
    [date]:
      s: number;
      ...

project: -> TTWorkContextSessionMap
  [projectId]: -> TTWorkSessionByDateMap
    [date]: -> TTWorkContextData
      s: number;
      ...
 */

// Map of work session stats by date
export type TTWorkSessionByDateMap = TTDateMap<TTWorkContextData>;

// Work context (project/tag) mapped to their session data by date
export type TTWorkContextSessionMap = TTModelIdMap<TTWorkSessionByDateMap>;

// Main state container
export interface TimeTrackingState {
  project: TTWorkContextSessionMap;
  tag: TTWorkContextSessionMap;
  /**
   * Optional cross-device register for the one active task/focus session.
   * Optional for compatibility with every existing persisted snapshot.
   */
  activeSession?: SharedActiveSession | null;
  // somehow can't be optional for ngrx
}

export const ACTIVE_SESSION_FORMAT_VERSION = 1 as const;
export const ACTIVE_SESSION_ENTITY_ID = 'ACTIVE_SESSION' as const;
export const ACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SharedFocusSession {
  mode: 'Flowtime' | 'Pomodoro' | 'Countdown';
  purpose: 'work' | 'break';
  isRunning: boolean;
  startedAt: number | null;
  elapsed: number;
  duration: number;
  currentCycle: number;
  pausedTaskId: string | null;
  isLongBreak?: boolean;
  isManualBreak?: boolean;
}

export interface SharedActiveSession {
  version: typeof ACTIVE_SESSION_FORMAT_VERSION;
  id: string;
  ownerClientId: string;
  taskId: string | null;
  updatedAt: number;
  expiresAt: number;
  focus: SharedFocusSession | null;
}

export const isSharedActiveSessionExpired = (
  session: SharedActiveSession,
  now: number,
): boolean => now >= session.expiresAt;

export const isWorkContextData = (obj: unknown): obj is TTWorkContextData =>
  typeof obj === 'object' &&
  obj !== null &&
  ('s' in obj || 'e' in obj || 'b' in obj || 'bt' in obj);
