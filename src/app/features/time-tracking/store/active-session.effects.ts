import { inject, Injectable } from '@angular/core';
import { createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { combineLatest, EMPTY, firstValueFrom, from, timer } from 'rxjs';
import { catchError, concatMap, map, take, withLatestFrom } from 'rxjs/operators';
import { ClientIdService } from '../../../core/util/client-id.service';
import { Log } from '../../../core/log';
import { allDataWasLoaded } from '../../../root-store/meta/all-data-was-loaded.actions';
import { LOCAL_ACTIONS } from '../../../util/local-actions.token';
import { uuidv7 } from '../../../util/uuid-v7';
import * as focusActions from '../../focus-mode/store/focus-mode.actions';
import { selectFocusModeState } from '../../focus-mode/store/focus-mode.selectors';
import { setCurrentTask, unsetCurrentTask } from '../../tasks/store/task.actions';
import { selectCurrentTaskId } from '../../tasks/store/task.selectors';
import {
  ACTIVE_SESSION_FORMAT_VERSION,
  ACTIVE_SESSION_TTL_MS,
  SharedActiveSession,
  SharedFocusSession,
  isSharedActiveSessionExpired,
} from '../time-tracking.model';
import { projectActiveSession, syncActiveSession } from './time-tracking.actions';
import { selectSharedActiveSession } from './time-tracking.selectors';
import { skipDuringSyncWindow } from '../../../util/skip-during-sync-window.operator';

@Injectable()
export class ActiveSessionEffects {
  private readonly _actions$ = inject(LOCAL_ACTIONS);
  private readonly _store = inject(Store);
  private readonly _clientIdService = inject(ClientIdService);

  publishTransition$ = createEffect(() =>
    this._actions$.pipe(
      ofType(
        setCurrentTask,
        unsetCurrentTask,
        focusActions.startFocusSession,
        focusActions.pauseFocusSession,
        focusActions.unPauseFocusSession,
        focusActions.completeFocusSession,
        focusActions.cancelFocusSession,
        focusActions.endFlowtimeSession,
        focusActions.startBreak,
        focusActions.skipBreak,
        focusActions.completeBreak,
        focusActions.adjustRemainingTime,
        focusActions.restoreFocusSessionFromNative,
      ),
      concatMap(() =>
        from(this._buildOwnedSession()).pipe(
          map((activeSession) => syncActiveSession({ activeSession })),
          catchError((error: unknown) => {
            Log.err('[ActiveSessionEffects] Failed to publish active session', error);
            return EMPTY;
          }),
        ),
      ),
    ),
  );

  restoreOrExpireOnHydration$ = createEffect(() =>
    this._actions$.pipe(
      ofType(allDataWasLoaded),
      withLatestFrom(this._store.select(selectSharedActiveSession)),
      concatMap(async ([, activeSession]) => {
        if (!activeSession) return EMPTY;
        if (isSharedActiveSessionExpired(activeSession, Date.now())) {
          return [syncActiveSession({ activeSession: null })];
        }
        const clientId = await this._clientIdService.getOrGenerateClientId();
        return [
          projectActiveSession({
            activeSession,
            isMirror: activeSession.ownerClientId !== clientId,
          }),
        ];
      }),
      concatMap((actions) => actions),
    ),
  );

  expireStaleSession$ = createEffect(() =>
    timer(60_000, 60_000).pipe(
      skipDuringSyncWindow(),
      withLatestFrom(this._store.select(selectSharedActiveSession)),
      concatMap(([, activeSession]) =>
        activeSession && isSharedActiveSessionExpired(activeSession, Date.now())
          ? [syncActiveSession({ activeSession: null })]
          : EMPTY,
      ),
    ),
  );

  takeOverTracking$ = createEffect(() =>
    this._actions$.pipe(
      ofType(focusActions.takeOverSharedSession),
      withLatestFrom(this._store.select(selectSharedActiveSession)),
      concatMap(([, activeSession]) => {
        if (!activeSession) return EMPTY;
        if (activeSession.taskId) {
          return [setCurrentTask({ id: activeSession.taskId })];
        }
        return from(this._claimFocusOnlySession(activeSession));
      }),
    ),
  );

  private async _claimFocusOnlySession(
    activeSession: SharedActiveSession,
  ): Promise<ReturnType<typeof syncActiveSession>> {
    const ownerClientId = await this._clientIdService.getOrGenerateClientId();
    const now = Date.now();
    return syncActiveSession({
      activeSession: {
        ...activeSession,
        ownerClientId,
        updatedAt: now,
        expiresAt: now + ACTIVE_SESSION_TTL_MS,
      },
    });
  }

  private async _buildOwnedSession(): Promise<SharedActiveSession | null> {
    const [taskId, focusState, previous] = await firstValueFrom(
      combineLatest([
        this._store.select(selectCurrentTaskId),
        this._store.select(selectFocusModeState),
        this._store.select(selectSharedActiveSession),
      ]).pipe(take(1)),
    );

    const focus: SharedFocusSession | null = focusState.timer.purpose
      ? {
          mode: focusState.mode,
          purpose: focusState.timer.purpose,
          isRunning: focusState.timer.isRunning,
          startedAt: focusState.timer.startedAt,
          elapsed: focusState.timer.elapsed,
          duration: focusState.timer.duration,
          currentCycle: focusState.currentCycle,
          pausedTaskId: focusState.pausedTaskId,
          ...(focusState.timer.purpose === 'break'
            ? {
                isLongBreak: focusState.timer.isLongBreak,
                isManualBreak: focusState.timer.isManualBreak,
              }
            : {}),
        }
      : null;

    if (!taskId && !focus) return null;

    const ownerClientId = await this._clientIdService.getOrGenerateClientId();
    const now = Date.now();
    return {
      version: ACTIVE_SESSION_FORMAT_VERSION,
      id: previous?.id ?? uuidv7(),
      ownerClientId,
      taskId,
      updatedAt: now,
      expiresAt: now + ACTIVE_SESSION_TTL_MS,
      focus,
    };
  }
}
