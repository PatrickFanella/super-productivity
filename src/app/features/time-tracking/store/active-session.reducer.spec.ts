/* eslint-disable @typescript-eslint/naming-convention */
import {
  focusModeReducer,
  initialState as initialFocusState,
} from '../../focus-mode/store/focus-mode.reducer';
import { tickSharedSessionMirror } from '../../focus-mode/store/focus-mode.actions';
import { initialTaskState, taskReducer } from '../../tasks/store/task.reducer';
import { SharedActiveSession } from '../time-tracking.model';
import { projectActiveSession, syncActiveSession } from './time-tracking.actions';
import { initialTimeTrackingState, timeTrackingReducer } from './time-tracking.reducer';

describe('shared active session reducers', () => {
  const activeSession: SharedActiveSession = {
    version: 1,
    id: 'session-1',
    ownerClientId: 'client-a',
    taskId: null,
    updatedAt: 1_000,
    expiresAt: 2_000,
    focus: {
      mode: 'Countdown',
      purpose: 'work',
      isRunning: true,
      startedAt: 500,
      elapsed: 500,
      duration: 10_000,
      currentCycle: 1,
      pausedTaskId: null,
    },
  };

  it('stores the register without replacing historical time tracking', () => {
    const state = {
      project: { project1: { '2026-08-04': { s: 1, e: 2 } } },
      tag: { tag1: { '2026-08-04': { s: 1, e: 2 } } },
    };

    const result = timeTrackingReducer(state, syncActiveSession({ activeSession }));

    expect(result.project).toBe(state.project);
    expect(result.tag).toBe(state.tag);
    expect(result.activeSession).toEqual(activeSession);
  });

  it('reconstructs a read-only focus mirror on hydration', () => {
    const result = focusModeReducer(
      initialFocusState,
      projectActiveSession({ activeSession, isMirror: true }),
    );

    expect(result._isSharedSessionMirror).toBeTrue();
    expect(result.timer.isRunning).toBeTrue();
    expect(result.timer.purpose).toBe('work');
    expect(result.timer.elapsed).toBe(500);
    expect(result.timer.duration).toBe(10_000);
  });

  it('marks a task-only remote session as a mirror with explicit takeover', () => {
    const result = focusModeReducer(
      initialFocusState,
      projectActiveSession({
        activeSession: { ...activeSession, focus: null },
        isMirror: true,
      }),
    );

    expect(result._isSharedSessionMirror).toBeTrue();
    expect(result.timer.purpose).toBeNull();
  });

  it('ticks a mirror without triggering focus completion state', () => {
    const mirrored = focusModeReducer(
      initialFocusState,
      projectActiveSession({
        activeSession: {
          ...activeSession,
          focus: { ...activeSession.focus!, elapsed: 9_999 },
        },
        isMirror: true,
      }),
    );

    const result = focusModeReducer(mirrored, tickSharedSessionMirror());

    expect(result.timer.elapsed).toBe(10_000);
    expect(result.timer.isRunning).toBeFalse();
    expect(result._isSharedSessionMirror).toBeTrue();
  });

  it('stops local task ownership when another client session arrives', () => {
    const state = { ...initialTaskState, currentTaskId: 'task-local' };
    const action = syncActiveSession({ activeSession });

    const remoteAction = {
      ...action,
      meta: {
        ...action.meta,
        isRemote: true,
        isApplyingFromOtherClient: true,
      },
    } as ReturnType<typeof syncActiveSession>;

    const result = taskReducer(state, remoteAction);

    expect(result.currentTaskId).toBeNull();
    expect(result.lastCurrentTaskId).toBe('task-local');
  });

  it('keeps the persisted field optional for old snapshots', () => {
    expect(initialTimeTrackingState.activeSession).toBeUndefined();
  });
});
