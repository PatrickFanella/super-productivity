import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import {
  catchError,
  concatMap,
  distinctUntilChanged,
  map,
  switchMap,
} from 'rxjs/operators';
import { DataInitStateService } from '../../core/data-init/data-init-state.service';
import { PluginLog } from '../../core/log';
import { selectAll } from '../../features/issue/store/issue-provider.selectors';
import {
  getIssueProviderSecretOwnerKey,
  PluginSecretService,
} from '../secret/plugin-secret.service';

@Injectable({ providedIn: 'root' })
export class PluginIssueProviderSecretCleanupService {
  private readonly _store = inject(Store);
  private readonly _dataInitState = inject(DataInitStateService);
  private readonly _pluginSecretService = inject(PluginSecretService);
  private readonly _destroyRef = inject(DestroyRef);

  constructor() {
    this._dataInitState.isAllDataLoadedInitially$
      .pipe(
        switchMap(() => this._store.select(selectAll)),
        map((providers) =>
          providers
            .flatMap((provider) =>
              'pluginId' in provider && typeof provider.pluginId === 'string'
                ? [getIssueProviderSecretOwnerKey(provider.pluginId, provider.id)]
                : [],
            )
            .sort(),
        ),
        distinctUntilChanged(
          (previous, current) =>
            previous.length === current.length &&
            previous.every((id, index) => id === current[index]),
        ),
        concatMap((providerIds) =>
          from(
            this._pluginSecretService.removeOrphanedIssueProviderSecrets(
              new Set(providerIds),
            ),
          ).pipe(
            catchError((error) => {
              PluginLog.err(
                'PluginIssueProviderSecretCleanupService: cleanup failed',
                error,
              );
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe();
  }
}
