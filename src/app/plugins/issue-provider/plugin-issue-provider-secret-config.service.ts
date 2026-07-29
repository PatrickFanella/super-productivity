import { inject, Injectable } from '@angular/core';
import { IssueProviderPluginType } from '../../features/issue/issue.model';
import { PluginSecretService } from '../secret/plugin-secret.service';
import { RegisteredPluginIssueProvider } from './plugin-issue-provider.model';

const SECRET_KEY_PREFIX = 'issue-provider:';

const encodeKeySegment = (value: string): string => encodeURIComponent(value);

interface StoredIssueProviderSecret {
  version: 1;
  value: string;
  binding: string;
}

@Injectable({ providedIn: 'root' })
export class PluginIssueProviderSecretConfigService {
  private readonly _pluginSecretService = inject(PluginSecretService);

  async resolve(
    provider: RegisteredPluginIssueProvider,
    cfg: IssueProviderPluginType,
    legacySourceCfg?: IssueProviderPluginType,
  ): Promise<Record<string, unknown>> {
    const resolved = { ...cfg.pluginConfig };
    for (const field of this._getLocalOnlyFields(provider)) {
      const configuredValue = this._getUsableConfiguredValue(
        field,
        cfg.pluginConfig,
        legacySourceCfg?.pluginConfig,
      );
      if (configuredValue !== null) {
        resolved[field.key] = configuredValue;
        continue;
      }
      delete resolved[field.key];
      const secret = await this._pluginSecretService.getSecret(
        provider.pluginId,
        this._secretKey(cfg.id, field.key),
      );
      const value = this._readStoredValue(
        secret,
        this._binding(field, cfg.pluginConfig),
        !!field.localOnlyScope?.length,
      );
      if (value !== null) {
        resolved[field.key] = value;
      }
    }
    return resolved;
  }

  async persistAndSanitize(
    provider: RegisteredPluginIssueProvider,
    cfg: IssueProviderPluginType,
    legacySourceCfg?: IssueProviderPluginType,
  ): Promise<IssueProviderPluginType> {
    const fields = this._getLocalOnlyFields(provider);
    if (fields.length === 0) {
      return cfg;
    }

    const previous = new Map<string, string | null>();
    try {
      for (const field of fields) {
        const key = this._secretKey(cfg.id, field.key);
        previous.set(
          key,
          await this._pluginSecretService.getSecret(provider.pluginId, key),
        );
        const value = this._getUsableConfiguredValue(
          field,
          cfg.pluginConfig,
          legacySourceCfg?.pluginConfig,
        );
        if (value !== null) {
          await this._pluginSecretService.setSecret(
            provider.pluginId,
            key,
            this._serializeStoredValue(value, this._binding(field, cfg.pluginConfig)),
          );
        } else if (
          !field.required ||
          this._readStoredValue(
            previous.get(key) ?? null,
            this._binding(field, cfg.pluginConfig),
            !!field.localOnlyScope?.length,
          ) === null
        ) {
          await this._pluginSecretService.deleteSecret(provider.pluginId, key);
        }
      }
    } catch (error) {
      await this._restoreSecrets(provider.pluginId, previous);
      throw error;
    }

    return {
      ...cfg,
      pluginConfig: this.stripLocalOnlyValues(provider, cfg.pluginConfig),
    };
  }

  stripLocalOnlyValues(
    provider: RegisteredPluginIssueProvider,
    pluginConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized = { ...pluginConfig };
    for (const field of this._getLocalOnlyFields(provider)) {
      delete sanitized[field.key];
    }
    return sanitized;
  }

  hasLegacyLocalOnlyValue(
    provider: RegisteredPluginIssueProvider,
    pluginConfig: Record<string, unknown>,
  ): boolean {
    return this._getLocalOnlyFields(provider).some((field) => {
      const value = pluginConfig[field.key];
      return typeof value === 'string' && value.length > 0;
    });
  }

  async hasRequiredLocalOnlyValues(
    provider: RegisteredPluginIssueProvider,
    cfg: IssueProviderPluginType,
    legacySourceCfg?: IssueProviderPluginType,
  ): Promise<boolean> {
    for (const field of this._getLocalOnlyFields(provider).filter(
      (candidate) => candidate.required,
    )) {
      const configuredValue = this._getUsableConfiguredValue(
        field,
        cfg.pluginConfig,
        legacySourceCfg?.pluginConfig,
      );
      if (configuredValue !== null) {
        continue;
      }
      if (!(await this.hasStoredSecret(provider, cfg, field.key))) {
        return false;
      }
    }
    return true;
  }

  async hasStoredSecret(
    provider: RegisteredPluginIssueProvider,
    cfg: IssueProviderPluginType,
    fieldKey: string,
  ): Promise<boolean> {
    const field = this._getLocalOnlyFields(provider).find(
      (candidate) => candidate.key === fieldKey,
    );
    if (!field) {
      return false;
    }
    const stored = await this._pluginSecretService.getSecret(
      provider.pluginId,
      this._secretKey(cfg.id, fieldKey),
    );
    return (
      this._readStoredValue(
        stored,
        this._binding(field, cfg.pluginConfig),
        !!field.localOnlyScope?.length,
      ) !== null
    );
  }

  async removeProviderSecrets(
    provider: RegisteredPluginIssueProvider,
    providerId: string,
  ): Promise<void> {
    await this._pluginSecretService.removeSecretsWithKeyPrefix(
      provider.pluginId,
      this._providerKeyPrefix(providerId),
    );
  }

  private _getLocalOnlyFields(provider: RegisteredPluginIssueProvider): {
    key: string;
    required?: boolean;
    localOnlyScope?: string[];
  }[] {
    return (provider.definition.configFields ?? []).filter((field) => field.localOnly);
  }

  private _secretKey(providerId: string, fieldKey: string): string {
    return `${this._providerKeyPrefix(providerId)}${encodeKeySegment(fieldKey)}`;
  }

  private _providerKeyPrefix(providerId: string): string {
    return `${SECRET_KEY_PREFIX}${encodeKeySegment(providerId)}:`;
  }

  private _binding(
    field: { localOnlyScope?: string[] },
    pluginConfig: Record<string, unknown>,
  ): string {
    return JSON.stringify(
      (field.localOnlyScope ?? []).map((key) => [key, pluginConfig[key] ?? null]),
    );
  }

  private _getUsableConfiguredValue(
    field: { key: string; localOnlyScope?: string[] },
    pluginConfig: Record<string, unknown>,
    legacySourceConfig?: Record<string, unknown>,
  ): string | null {
    const value = pluginConfig[field.key];
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    const legacyValue = legacySourceConfig?.[field.key];
    const isInheritedLegacyValue =
      legacySourceConfig !== undefined &&
      typeof legacyValue === 'string' &&
      legacyValue.length > 0 &&
      legacyValue === value;
    if (
      isInheritedLegacyValue &&
      this._binding(field, legacySourceConfig) !== this._binding(field, pluginConfig)
    ) {
      return null;
    }
    return value;
  }

  private _serializeStoredValue(value: string, binding: string): string {
    const stored: StoredIssueProviderSecret = {
      version: 1,
      value,
      binding,
    };
    return JSON.stringify(stored);
  }

  private _readStoredValue(
    stored: string | null,
    expectedBinding: string,
    requiresBinding: boolean,
  ): string | null {
    if (stored === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(stored) as Partial<StoredIssueProviderSecret>;
      return parsed.version === 1 &&
        typeof parsed.value === 'string' &&
        parsed.binding === expectedBinding
        ? parsed.value
        : null;
    } catch {
      return requiresBinding ? null : stored;
    }
  }

  private async _restoreSecrets(
    pluginId: string,
    previous: Map<string, string | null>,
  ): Promise<void> {
    for (const [key, value] of previous) {
      if (value === null) {
        await this._pluginSecretService.deleteSecret(pluginId, key);
      } else {
        await this._pluginSecretService.setSecret(pluginId, key, value);
      }
    }
  }
}
