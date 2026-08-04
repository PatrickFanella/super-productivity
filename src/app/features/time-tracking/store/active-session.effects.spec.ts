import { TestBed } from '@angular/core/testing';
import { Action, Store } from '@ngrx/store';
import { ReplaySubject, of } from 'rxjs';
import { ClientIdService } from '../../../core/util/client-id.service';
import { SyncTriggerService } from '../../../imex/sync/sync-trigger.service';
import { HydrationStateService } from '../../../op-log/apply/hydration-state.service';
import { allDataWasLoaded } from '../../../root-store/meta/all-data-was-loaded.actions';
import { LOCAL_ACTIONS } from '../../../util/local-actions.token';
import { SharedActiveSession } from '../time-tracking.model';
import { ActiveSessionEffects } from './active-session.effects';
import { projectActiveSession, syncActiveSession } from './time-tracking.actions';

describe('ActiveSessionEffects', () => {
  let actions$: ReplaySubject<Action>;
  let store: jasmine.SpyObj<Store>;
  let clientIdService: jasmine.SpyObj<ClientIdService>;

  const session = (expiresAt: number): SharedActiveSession => ({
    version: 1,
    id: 'session-1',
    ownerClientId: 'client-a',
    taskId: null,
    updatedAt: 1,
    expiresAt,
    focus: null,
  });

  beforeEach(() => {
    actions$ = new ReplaySubject<Action>(1);
    store = jasmine.createSpyObj<Store>('Store', ['select']);
    clientIdService = jasmine.createSpyObj<ClientIdService>('ClientIdService', [
      'getOrGenerateClientId',
    ]);

    TestBed.configureTestingModule({
      providers: [
        ActiveSessionEffects,
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: Store, useValue: store },
        { provide: ClientIdService, useValue: clientIdService },
        {
          provide: HydrationStateService,
          useValue: { isInSyncWindow: () => false },
        },
        {
          provide: SyncTriggerService,
          useValue: { isInitialSyncDoneSync: () => true },
        },
      ],
    });
  });

  it('clears an expired register after hydration', (done) => {
    store.select.and.returnValue(of(session(Date.now() - 1)));
    const effects = TestBed.inject(ActiveSessionEffects);

    effects.restoreOrExpireOnHydration$.subscribe((action) => {
      expect(action).toEqual(syncActiveSession({ activeSession: null }));
      done();
    });
    actions$.next(allDataWasLoaded());
  });

  it('restores an owned register as writable after hydration', (done) => {
    const activeSession = session(Date.now() + 60_000);
    store.select.and.returnValue(of(activeSession));
    clientIdService.getOrGenerateClientId.and.resolveTo('client-a');
    const effects = TestBed.inject(ActiveSessionEffects);

    effects.restoreOrExpireOnHydration$.subscribe((action) => {
      expect(action).toEqual(projectActiveSession({ activeSession, isMirror: false }));
      done();
    });
    actions$.next(allDataWasLoaded());
  });

  it('restores another owner as a read-only mirror after hydration', (done) => {
    const activeSession = session(Date.now() + 60_000);
    store.select.and.returnValue(of(activeSession));
    clientIdService.getOrGenerateClientId.and.resolveTo('client-b');
    const effects = TestBed.inject(ActiveSessionEffects);

    effects.restoreOrExpireOnHydration$.subscribe((action) => {
      expect(action).toEqual(projectActiveSession({ activeSession, isMirror: true }));
      done();
    });
    actions$.next(allDataWasLoaded());
  });
});
