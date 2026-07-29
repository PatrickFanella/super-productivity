import { TestBed } from '@angular/core/testing';
import { IssueProviderPluginType } from '../../features/issue/issue.model';
import { PluginSecretService } from '../secret/plugin-secret.service';
import {
  IssueProviderPluginDefinition,
  RegisteredPluginIssueProvider,
} from './plugin-issue-provider.model';
import { PluginIssueProviderSecretConfigService } from './plugin-issue-provider-secret-config.service';

describe('PluginIssueProviderSecretConfigService', () => {
  let service: PluginIssueProviderSecretConfigService;
  let secretService: jasmine.SpyObj<PluginSecretService>;

  const definition: IssueProviderPluginDefinition = {
    configFields: [
      {
        key: 'password',
        type: 'password',
        label: 'Password',
        required: true,
        localOnly: true,
        localOnlyScope: ['serverUrl', 'username'],
      },
      { key: 'serverUrl', type: 'input', label: 'Server URL' },
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
  const cfg = (
    id: string,
    pluginConfig: Record<string, unknown>,
  ): IssueProviderPluginType =>
    ({
      id,
      isEnabled: true,
      issueProviderKey: provider.registeredKey,
      pluginId: provider.pluginId,
      pluginConfig,
    }) as IssueProviderPluginType;
  const storedSecret = (
    value: string,
    serverUrl: string | null,
    username: string | null = null,
  ): string =>
    JSON.stringify({
      version: 1,
      value,
      binding: JSON.stringify([
        ['serverUrl', serverUrl],
        ['username', username],
      ]),
    });

  beforeEach(() => {
    secretService = jasmine.createSpyObj<PluginSecretService>('PluginSecretService', [
      'getSecret',
      'setSecret',
      'deleteSecret',
      'removeSecretsWithKeyPrefix',
    ]);
    secretService.getSecret.and.resolveTo(null);
    secretService.setSecret.and.resolveTo();
    secretService.deleteSecret.and.resolveTo();
    secretService.removeSecretsWithKeyPrefix.and.resolveTo();
    TestBed.configureTestingModule({
      providers: [{ provide: PluginSecretService, useValue: secretService }],
    });
    service = TestBed.inject(PluginIssueProviderSecretConfigService);
  });

  it('resolves a device-local secret into a fresh runtime config', async () => {
    secretService.getSecret.and.resolveTo(
      storedSecret('device-password', 'https://calendar.example.com'),
    );
    const storedConfig = { serverUrl: 'https://calendar.example.com' };

    const result = await service.resolve(provider, cfg('work', storedConfig));

    expect(result).toEqual({
      serverUrl: 'https://calendar.example.com',
      password: 'device-password',
    });
    expect(storedConfig).toEqual({ serverUrl: 'https://calendar.example.com' });
    expect(secretService.getSecret).toHaveBeenCalledWith(
      provider.pluginId,
      'issue-provider:work:password',
    );
  });

  it('keeps a legacy or typed raw value as a runtime fallback', async () => {
    secretService.getSecret.and.resolveTo('older-device-password');

    const result = await service.resolve(
      provider,
      cfg('work', { password: 'typed-password' }),
    );

    expect(result['password']).toBe('typed-password');
    expect(secretService.getSecret).not.toHaveBeenCalled();
  });

  it('refuses to send a stored secret after its endpoint binding changes', async () => {
    secretService.getSecret.and.resolveTo(
      storedSecret('device-password', 'https://old.example.com', 'me'),
    );

    const result = await service.resolve(
      provider,
      cfg('work', {
        serverUrl: 'https://new.example.com',
        username: 'me',
      }),
    );

    expect(result['password']).toBeUndefined();
    expect(
      await service.hasRequiredLocalOnlyValues(
        provider,
        cfg('work', {
          serverUrl: 'https://new.example.com',
          username: 'me',
        }),
      ),
    ).toBeFalse();
  });

  it('refuses to rebind an inherited legacy secret to an edited endpoint', async () => {
    const legacyCfg = cfg('work', {
      serverUrl: 'https://old.example.com',
      username: 'me',
      password: 'legacy-password',
    });
    const editedCfg = cfg('work', {
      serverUrl: 'https://new.example.com',
      username: 'me',
      password: 'legacy-password',
    });

    const runtimeConfig = await service.resolve(provider, editedCfg, legacyCfg);

    expect(runtimeConfig['password']).toBeUndefined();
    expect(
      await service.hasRequiredLocalOnlyValues(provider, editedCfg, legacyCfg),
    ).toBeFalse();
    expect(secretService.setSecret).not.toHaveBeenCalled();
  });

  it('allows an explicit replacement secret for an edited endpoint', async () => {
    const legacyCfg = cfg('work', {
      serverUrl: 'https://old.example.com',
      username: 'me',
      password: 'legacy-password',
    });
    const editedCfg = cfg('work', {
      serverUrl: 'https://new.example.com',
      username: 'me',
      password: 'replacement-password',
    });

    const runtimeConfig = await service.resolve(provider, editedCfg, legacyCfg);
    const result = await service.persistAndSanitize(provider, editedCfg, legacyCfg);

    expect(runtimeConfig['password']).toBe('replacement-password');
    expect(secretService.setSecret).toHaveBeenCalledWith(
      provider.pluginId,
      'issue-provider:work:password',
      storedSecret('replacement-password', 'https://new.example.com', 'me'),
    );
    expect(result.pluginConfig['password']).toBeUndefined();
  });

  it('encodes provider ids so scoped secrets cannot collide', async () => {
    await service.persistAndSanitize(provider, cfg('work:primary', { password: 'one' }));
    await service.persistAndSanitize(provider, cfg('work', { password: 'two' }));

    expect(secretService.setSecret.calls.argsFor(0)[1]).toBe(
      'issue-provider:work%3Aprimary:password',
    );
    expect(secretService.setSecret.calls.argsFor(1)[1]).toBe(
      'issue-provider:work:password',
    );
  });

  it('stores the secret before returning a sanitized provider', async () => {
    const result = await service.persistAndSanitize(
      provider,
      cfg('work', {
        serverUrl: 'https://calendar.example.com',
        password: 'device-password',
      }),
    );

    expect(secretService.setSecret).toHaveBeenCalledWith(
      provider.pluginId,
      'issue-provider:work:password',
      storedSecret('device-password', 'https://calendar.example.com'),
    );
    expect(result.pluginConfig).toEqual({
      serverUrl: 'https://calendar.example.com',
    });
  });

  it('preserves a stored secret when an existing field is left blank', async () => {
    secretService.getSecret.and.resolveTo(
      storedSecret('keep-me', 'https://calendar.example.com'),
    );

    const result = await service.persistAndSanitize(
      provider,
      cfg('work', { serverUrl: 'https://calendar.example.com', password: '' }),
    );

    expect(secretService.setSecret).not.toHaveBeenCalled();
    expect(secretService.deleteSecret).not.toHaveBeenCalled();
    expect(result.pluginConfig).toEqual({
      serverUrl: 'https://calendar.example.com',
    });
  });

  it('restores the previous secret when a write fails', async () => {
    secretService.getSecret.and.resolveTo(storedSecret('old-password', null));
    secretService.setSecret.and.callFake(async (_pluginId, _key, value) => {
      if (value.includes('"value":"new-password"')) {
        throw new Error('storage unavailable');
      }
    });

    await expectAsync(
      service.persistAndSanitize(provider, cfg('work', { password: 'new-password' })),
    ).toBeRejectedWithError('storage unavailable');

    expect(secretService.setSecret).toHaveBeenCalledWith(
      provider.pluginId,
      'issue-provider:work:password',
      storedSecret('old-password', null),
    );
  });

  it('removes only the selected provider namespace', async () => {
    await service.removeProviderSecrets(provider, 'work:primary');

    expect(secretService.removeSecretsWithKeyPrefix).toHaveBeenCalledWith(
      provider.pluginId,
      'issue-provider:work%3Aprimary:',
    );
  });
});
