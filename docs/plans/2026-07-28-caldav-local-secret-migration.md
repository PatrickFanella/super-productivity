# CalDAV local-secret migration

**Status:** Implemented
**Scope:** Generic issue-provider plugin secret fields, first adopted by the bundled
CalDAV Events plugin

## Outcome

Move CalDAV credentials out of synchronized `IssueProvider.pluginConfig` and into
the existing per-device plugin secret store without silently breaking existing
configurations. The implementation must support multiple configurations owned by
the same plugin, keep runtime hydration ephemeral, and fail closed when local
secret persistence fails.

## Product boundary

- Server URL, username, selected calendars, sync directions, and other
  non-sensitive settings remain synchronized.
- Passwords and app tokens marked as local-only remain on the device on which
  they were entered. They are excluded from op-log synchronization, exports, and
  backups.
- Each device must receive its own credential after migration.
- The feature is a reusable plugin form-field capability, not a CalDAV-specific
  dialog exception.
- Existing configurations continue using their legacy synchronized password
  until the user explicitly saves the provider configuration.

## Data contract

Add an optional local-only marker to `PluginFormField`:

```ts
interface PluginFormField {
  localOnly?: boolean;
  localOnlyScope?: string[];
}
```

The CalDAV password field adopts it:

```ts
{
  key: 'password',
  type: 'password',
  localOnly: true,
  localOnlyScope: ['serverUrl', 'username'],
}
```

Synchronized configuration stores no password and needs no additional
reference. The host already has the stable issue-provider configuration ID at
every asynchronous callback boundary.

The local secret key is provider-scoped:

```text
plugin id: caldav-calendar-provider
secret key: issue-provider:<issue-provider-id>:password
```

This permits personal and work CalDAV accounts to coexist without sharing or
overwriting credentials. Its local value is stored in a versioned envelope
bound to the declared non-secret scope. Runtime hydration refuses the password
when the server URL or username no longer matches, so a remote change, restore,
or local edit cannot send an old password to a new endpoint.

## Save transaction

The generic issue-provider dialog owns the persistence boundary:

1. Identify plugin fields marked `localOnly`.
2. Write or delete their local secrets first.
3. Abort without dispatching an NgRx update if any secret operation fails.
4. Clone the provider model and remove raw local-only values from
   `pluginConfig`.
5. Dispatch only the sanitized provider model.
6. Return only the sanitized model when closing the dialog.

No action, state snapshot, log, dialog result, export, or backup may contain the
migrated password.

## Runtime hydration

Plugin callbacks receive an ephemeral configuration copy:

1. Start with synchronized `pluginConfig`.
2. Keep a non-empty raw value as the legacy or unsaved-dialog compatibility
   value only while its declared server/account scope still matches the
   original persisted configuration. Withhold an inherited legacy value after
   a scope edit.
3. Otherwise resolve each local-only field from the plugin secret store using
   the registered plugin ID, provider ID, and field key.
4. Overlay resolved secrets on the ephemeral copy.
5. Invoke the plugin callback or asynchronous header provider.
6. Never write the hydrated object into NgRx or shared persistence.

Legacy `pluginConfig.password` remains a runtime fallback until the user
explicitly saves and migrates that provider.

## Migration behavior

| Situation | Behavior |
| --- | --- |
| Existing provider before settings are saved | Continue using the legacy synchronized password. |
| Existing provider saved on an updated device | Store password locally and remove the raw password from synchronized config. |
| Migrated provider arrives on another updated device | Preserve synchronized non-secret settings and require a device-local password. |
| Provider opened without a local secret | Show an empty required credential field; do not resurrect a removed synchronized password. |
| New provider | Store the entered password locally before adding the sanitized provider. |
| Password changed | Replace only that provider configuration's local secret. |
| Server URL or username changed | Refuse the old local secret and require a new credential for the changed account. |
| Server URL or username changed before the first migration | Withhold the inherited legacy password from option loading and connection tests; require an explicitly replaced credential before save. |
| Existing stored password field left blank | Keep the current device-local credential. |
| Required password missing on a new device | Prevent save until a credential is entered. |
| Secret-store operation fails | Keep synchronized state unchanged and keep the dialog open with an error. |
| Provider duplicated | Generate a new provider ID and require a new local credential; never copy the original local secret. |
| Provider deleted | Remove only secrets belonging to that provider ID. |
| Provider removed by remote sync or state replacement | Reconcile after hydration and remove only orphaned provider secret namespaces. |
| Plugin uninstalled | Existing plugin cleanup removes all secrets in the plugin namespace. |
| Backup restored on another device | Restore non-secret configuration and require local credentials. |

## Older-client boundary

An older client only understands `pluginConfig.password`. Once an updated device
removes that synchronized field, the older client cannot authenticate.

Migration therefore occurs only on an explicit save and must warn the user that:

- credentials will become device-local;
- other devices should be updated first; and
- each device will need its own password or app token.

Opening the dialog, loading calendar options, syncing, or starting the app must
not silently migrate credentials.

## Expected implementation owners

- `packages/plugin-api/src/issue-provider-types.ts`
  - Declare the reusable local-only form-field contract.
- `src/app/features/issue/dialog-edit-issue-provider/`
  - Load, save, sanitize, duplicate, delete, warn, and failure behavior.
- `src/app/plugins/secret/`
  - Provider-scoped key helpers and targeted cleanup.
- `src/app/plugins/issue-provider/`
  - Ephemeral runtime secret hydration for adapter and synchronization calls.
- `packages/plugin-dev/caldav-calendar-provider/`
  - Mark the password local-only and use hydrated or legacy credentials.
- `docs/wiki/`
  - Explain per-device credentials and the compatibility boundary.

## Verification contract

Automated coverage must prove:

1. Two provider configurations cannot read or overwrite each other's secrets.
2. A successful save stores the secret before dispatch and strips the password
   from the dispatched provider and dialog result.
3. A secret-store failure dispatches nothing.
4. New and migrated configurations use local credentials at runtime.
5. Legacy configurations continue working before explicit migration.
6. A migrated configuration without a local secret fails authentication and
   asks for credentials.
7. Dynamic calendar loading uses the ephemeral local credential.
8. Dynamic loading and connection tests cannot send an inherited legacy
   credential after its server/account scope changes.
9. Duplicating a provider does not copy the local secret.
10. Deleting a provider removes only its provider-scoped secrets.
11. Plugin uninstall still removes all plugin-owned secrets.
12. Export and backup paths never contain a migrated password.
13. Required TypeScript/SCSS `checkFile` checks, focused unit suites, shared
    plugin/issue-provider suites, plugin build, and a production frontend build
    pass.

## Verification evidence

- All modified TypeScript files passed `npm run checkFile`.
- The local-secret configuration, orphan cleanup, dialog transaction, plugin
  secret store, issue adapter, two-way sync adapter, time-block, calendar
  integration, and plugin bridge focused suites passed.
- The CalDAV plugin passed 80 Vitest cases, TypeScript type checking, and its
  production plugin build.
- `npm run buildFrontend:e2e` built all 13 bundled plugins and the production
  Angular application successfully.

## Rollback boundary

The code can be rolled back while synchronized configurations still retain their
legacy password. After a provider is explicitly migrated and the sanitized
configuration synchronizes, rolling back that device or another device to an
older client does not restore authentication.

Do not provide an automatic "copy local password back into sync" rollback. A
user who intentionally returns to an older build must explicitly re-enter the
credential there, accepting that it will again be synchronized by that older
client.
