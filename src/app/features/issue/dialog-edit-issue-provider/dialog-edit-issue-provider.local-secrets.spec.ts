import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { PluginBridgeService } from '../../../plugins/plugin-bridge.service';
import { PluginHttpService } from '../../../plugins/issue-provider/plugin-http.service';
import { PluginIssueProviderRegistryService } from '../../../plugins/issue-provider/plugin-issue-provider-registry.service';
import {
  IssueProviderPluginDefinition,
  RegisteredPluginIssueProvider,
} from '../../../plugins/issue-provider/plugin-issue-provider.model';
import { PluginIssueProviderSecretConfigService } from '../../../plugins/issue-provider/plugin-issue-provider-secret-config.service';
import { SnackService } from '../../../core/snack/snack.service';
import { TaskService } from '../../tasks/task.service';
import { TagService } from '../../tag/tag.service';
import { IssueService } from '../issue.service';
import { IssueProviderPluginType } from '../issue.model';
import { DialogEditIssueProviderComponent } from './dialog-edit-issue-provider.component';

describe('DialogEditIssueProviderComponent local-only secrets', () => {
  let fixture: ComponentFixture<DialogEditIssueProviderComponent>;
  let component: DialogEditIssueProviderComponent;
  let store: jasmine.SpyObj<Store>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<DialogEditIssueProviderComponent>>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let secretConfig: jasmine.SpyObj<PluginIssueProviderSecretConfigService>;
  let issueService: jasmine.SpyObj<IssueService>;
  const loadOptionsSpy = jasmine
    .createSpy('loadOptions')
    .and.resolveTo([{ label: 'Work', value: 'work' }]);

  const definition: IssueProviderPluginDefinition = {
    configFields: [
      {
        key: 'password',
        type: 'password',
        label: 'Password',
        required: true,
        localOnly: true,
      },
      {
        key: 'readCalendarIds',
        type: 'multiSelect',
        label: 'Calendars',
        options: [],
        loadOptions: loadOptionsSpy,
      },
    ],
    getHeaders: () => ({}),
    searchIssues: async () => [],
    getById: async (id) => ({ id, title: id }),
    getIssueLink: () => '',
    issueDisplay: [],
  };
  const provider: RegisteredPluginIssueProvider = {
    pluginId: 'caldav-calendar-provider',
    registeredKey: 'plugin:caldav-calendar-provider',
    definition,
    name: 'CalDAV',
    humanReadableName: 'CalDAV',
    icon: 'event',
    pollIntervalMs: 0,
    issueStrings: { singular: 'Event', plural: 'Events' },
  };

  beforeEach(async () => {
    loadOptionsSpy.calls.reset();
    const pluginRegistry = jasmine.createSpyObj<PluginIssueProviderRegistryService>(
      'PluginIssueProviderRegistryService',
      [
        'hasProvider',
        'getUseAgendaView',
        'getProvider',
        'getName',
        'getConfigFields',
        'getFieldMappings',
      ],
    );
    pluginRegistry.hasProvider.and.returnValue(true);
    pluginRegistry.getUseAgendaView.and.returnValue(true);
    pluginRegistry.getProvider.and.returnValue(provider);
    pluginRegistry.getName.and.returnValue('CalDAV');
    pluginRegistry.getConfigFields.and.returnValue(definition.configFields);
    pluginRegistry.getFieldMappings.and.returnValue([]);

    store = jasmine.createSpyObj<Store>('Store', ['dispatch', 'select', 'pipe']);
    dialogRef = jasmine.createSpyObj<MatDialogRef<DialogEditIssueProviderComponent>>(
      'MatDialogRef',
      ['close'],
    );
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    secretConfig = jasmine.createSpyObj<PluginIssueProviderSecretConfigService>(
      'PluginIssueProviderSecretConfigService',
      [
        'hasStoredSecret',
        'hasRequiredLocalOnlyValues',
        'hasLegacyLocalOnlyValue',
        'persistAndSanitize',
        'stripLocalOnlyValues',
        'resolve',
        'removeProviderSecrets',
      ],
    );
    secretConfig.hasStoredSecret.and.resolveTo(false);
    secretConfig.hasRequiredLocalOnlyValues.and.resolveTo(true);
    secretConfig.hasLegacyLocalOnlyValue.and.returnValue(false);
    secretConfig.resolve.and.callFake(async (_provider, cfg) => cfg.pluginConfig);
    issueService = jasmine.createSpyObj<IssueService>('IssueService', ['testConnection']);
    issueService.testConnection.and.resolveTo(false);

    const pluginBridge = jasmine.createSpyObj<PluginBridgeService>(
      'PluginBridgeService',
      ['restoreAndCheckOAuthTokens', 'clearOAuthTokens', 'startOAuthFlow'],
    );
    pluginBridge.restoreAndCheckOAuthTokens.and.resolveTo(false);

    await TestBed.configureTestingModule({
      imports: [DialogEditIssueProviderComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { issueProviderKey: provider.registeredKey },
        },
        { provide: PluginIssueProviderRegistryService, useValue: pluginRegistry },
        { provide: PluginBridgeService, useValue: pluginBridge },
        {
          provide: PluginHttpService,
          useValue: { createHttpHelper: () => ({}) },
        },
        { provide: PluginIssueProviderSecretConfigService, useValue: secretConfig },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MatDialog, useValue: dialog },
        { provide: Store, useValue: store },
        {
          provide: IssueService,
          useValue: issueService,
        },
        {
          provide: SnackService,
          useValue: jasmine.createSpyObj<SnackService>('SnackService', ['open']),
        },
        { provide: TaskService, useValue: { allTasks$: of([]) } },
        { provide: TagService, useValue: { tagsNoMyDayAndNoList$: of([]) } },
      ],
    })
      .overrideComponent(DialogEditIssueProviderComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DialogEditIssueProviderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('dispatches and closes with only the sanitized provider', async () => {
    component.model = {
      ...component.model,
      pluginConfig: {
        serverUrl: 'https://calendar.example.com',
        password: 'device-password',
      },
    };
    const sanitized = {
      ...component.model,
      pluginConfig: { serverUrl: 'https://calendar.example.com' },
    } as IssueProviderPluginType;
    secretConfig.persistAndSanitize.and.resolveTo(sanitized);

    await component.submit();

    const dispatchedProvider = (
      store.dispatch.calls.mostRecent().args[0] as unknown as {
        issueProvider: IssueProviderPluginType;
      }
    ).issueProvider;
    expect(dispatchedProvider.pluginConfig['password']).toBeUndefined();
    expect(dialogRef.close).toHaveBeenCalledWith(sanitized);
  });

  it('dispatches nothing when local credential persistence fails', async () => {
    secretConfig.persistAndSanitize.and.rejectWith(new Error('storage unavailable'));

    await component.submit();

    expect(store.dispatch).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('requires re-entry when the stored credential scope no longer matches', async () => {
    secretConfig.hasRequiredLocalOnlyValues.and.resolveTo(false);

    await component.submit();

    expect(secretConfig.persistAndSanitize).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('strips a legacy credential before opening a duplicate', () => {
    component.model = {
      ...component.model,
      pluginConfig: { password: 'legacy-password' },
    };
    secretConfig.stripLocalOnlyValues.and.returnValue({});
    dialog.open.and.returnValue({
      afterClosed: () => of(undefined),
    } as MatDialogRef<unknown>);

    component.duplicate();

    const duplicateData = dialog.open.calls.mostRecent().args[1]?.data as {
      issueProvider: IssueProviderPluginType;
    };
    expect(duplicateData.issueProvider.pluginConfig['password']).toBeUndefined();
  });

  it('uses ephemeral local credentials while loading dynamic options', async () => {
    const runtimeConfig = {
      serverUrl: 'https://calendar.example.com',
      password: 'device-password',
    };
    secretConfig.resolve.and.resolveTo(runtimeConfig);

    await component.loadDynamicOptions();

    expect(loadOptionsSpy).toHaveBeenCalledWith(runtimeConfig, jasmine.anything());
  });

  it('passes the original config when resolving credentials for dynamic options', async () => {
    const persisted = {
      ...component.model,
      id: 'work',
      pluginConfig: {
        serverUrl: 'https://old.example.com',
        password: 'legacy-password',
      },
    } as IssueProviderPluginType;
    component.issueProvider = persisted;
    component.isEdit = true;
    component.model = {
      ...persisted,
      pluginConfig: {
        serverUrl: 'https://new.example.com',
        password: 'legacy-password',
      },
    };
    secretConfig.resolve.and.resolveTo({
      serverUrl: 'https://new.example.com',
    });

    await component.loadDynamicOptions();

    expect(secretConfig.resolve).toHaveBeenCalledWith(
      provider,
      component.model as IssueProviderPluginType,
      persisted,
    );
    expect(loadOptionsSpy).toHaveBeenCalledWith(
      { serverUrl: 'https://new.example.com' },
      jasmine.anything(),
    );
  });

  it('tests an edited endpoint without an inherited legacy credential', async () => {
    const persisted = {
      ...component.model,
      id: 'work',
      pluginConfig: {
        serverUrl: 'https://old.example.com',
        password: 'legacy-password',
      },
    } as IssueProviderPluginType;
    component.issueProvider = persisted;
    component.isEdit = true;
    component.model = {
      ...persisted,
      pluginConfig: {
        serverUrl: 'https://new.example.com',
        password: 'legacy-password',
      },
    };
    secretConfig.resolve.and.resolveTo({
      serverUrl: 'https://new.example.com',
    });

    await component.testConnection();

    expect(issueService.testConnection).toHaveBeenCalledWith(
      jasmine.objectContaining({
        pluginConfig: { serverUrl: 'https://new.example.com' },
      }),
    );
  });

  it('does not treat a replacement password as a legacy migration', async () => {
    const persisted = {
      ...component.model,
      id: 'work',
      pluginConfig: { serverUrl: 'https://calendar.example.com' },
    } as IssueProviderPluginType;
    const edited = {
      ...persisted,
      pluginConfig: {
        ...persisted.pluginConfig,
        password: 'replacement-password',
      },
    };
    component.issueProvider = persisted;
    component.isEdit = true;
    component.model = edited;
    secretConfig.persistAndSanitize.and.resolveTo(persisted);

    await component.submit();

    expect(secretConfig.hasLegacyLocalOnlyValue).toHaveBeenCalledWith(
      provider,
      persisted.pluginConfig,
    );
    expect(dialog.open).not.toHaveBeenCalled();
  });
});
