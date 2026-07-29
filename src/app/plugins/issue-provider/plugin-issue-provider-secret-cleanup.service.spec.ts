import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { BehaviorSubject, ReplaySubject } from 'rxjs';
import { DataInitStateService } from '../../core/data-init/data-init-state.service';
import { IssueProvider } from '../../features/issue/issue.model';
import { PluginSecretService } from '../secret/plugin-secret.service';
import { getIssueProviderSecretOwnerKey } from '../secret/plugin-secret.service';
import { PluginIssueProviderSecretCleanupService } from './plugin-issue-provider-secret-cleanup.service';

describe('PluginIssueProviderSecretCleanupService', () => {
  it('reconciles only after hydration and again after provider removal', fakeAsync(() => {
    const isLoaded$ = new ReplaySubject<boolean>(1);
    const providers$ = new BehaviorSubject<IssueProvider[]>([
      { id: 'work', pluginId: 'caldav' } as IssueProvider,
      { id: 'personal', pluginId: 'caldav' } as IssueProvider,
    ]);
    const store = jasmine.createSpyObj<Store>('Store', ['select']);
    store.select.and.returnValue(providers$);
    const secretService = jasmine.createSpyObj<PluginSecretService>(
      'PluginSecretService',
      ['removeOrphanedIssueProviderSecrets'],
    );
    secretService.removeOrphanedIssueProviderSecrets.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        PluginIssueProviderSecretCleanupService,
        { provide: Store, useValue: store },
        {
          provide: DataInitStateService,
          useValue: { isAllDataLoadedInitially$: isLoaded$ },
        },
        { provide: PluginSecretService, useValue: secretService },
      ],
    });

    TestBed.inject(PluginIssueProviderSecretCleanupService);
    expect(secretService.removeOrphanedIssueProviderSecrets).not.toHaveBeenCalled();

    isLoaded$.next(true);
    flushMicrotasks();
    expect(
      secretService.removeOrphanedIssueProviderSecrets.calls.mostRecent().args[0],
    ).toEqual(
      new Set([
        getIssueProviderSecretOwnerKey('caldav', 'personal'),
        getIssueProviderSecretOwnerKey('caldav', 'work'),
      ]),
    );

    providers$.next([{ id: 'work', pluginId: 'caldav' } as IssueProvider]);
    flushMicrotasks();
    expect(
      secretService.removeOrphanedIssueProviderSecrets.calls.mostRecent().args[0],
    ).toEqual(new Set([getIssueProviderSecretOwnerKey('caldav', 'work')]));
  }));
});
