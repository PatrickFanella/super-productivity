import { expect, test } from '../../fixtures/supersync.fixture';
import {
  closeClient,
  createSimulatedClient,
  createTestUser,
  getSuperSyncConfig,
  getTaskElement,
  startTimeTracking,
  waitForTask,
  type SimulatedE2EClient,
} from '../../utils/supersync-helpers';

type SharedClients = {
  clientA: SimulatedE2EClient;
  clientB: SimulatedE2EClient;
  taskName: string;
};

const createSharedClients = async (
  browser: Parameters<typeof createSimulatedClient>[0],
  baseURL: string | undefined,
  testRunId: string,
): Promise<SharedClients> => {
  const appUrl = baseURL || 'http://localhost:4242';
  const user = await createTestUser(testRunId);
  const syncConfig = getSuperSyncConfig(user);
  const taskName = `Active-Session-${testRunId}-${Date.now()}`;

  const clientA = await createSimulatedClient(browser, appUrl, 'A', testRunId);
  await clientA.sync.setupSuperSync({ ...syncConfig, enableWebSocket: true });
  await clientA.workView.addTask(taskName);
  await clientA.sync.syncAndWait();

  const clientB = await createSimulatedClient(browser, appUrl, 'B', testRunId);
  await clientB.sync.setupSuperSync({ ...syncConfig, enableWebSocket: true });
  await clientB.sync.syncAndWait();
  await waitForTask(clientB.page, taskName);

  // Establish the post-sync WebSocket download path on both clients before
  // creating the active-session operation that the other client must adopt.
  await clientA.sync.syncAndWait();
  await clientB.sync.syncAndWait();

  return { clientA, clientB, taskName };
};

test.describe('@supersync Active timer and focus handoff', () => {
  test('shows active task tracking on the other client', async ({
    browser,
    baseURL,
    testRunId,
  }) => {
    test.setTimeout(180000);

    let clients: SharedClients | null = null;
    try {
      clients = await createSharedClients(browser, baseURL, testRunId);
      const { clientA, clientB, taskName } = clients;

      await startTimeTracking(clientA, taskName);
      await expect(
        getTaskElement(clientA, taskName).locator('.play-indicator'),
      ).toBeVisible({ timeout: 5000 });
      await clientA.sync.syncAndWait();

      // Client B does not click sync: the active-session operation must arrive
      // through the established WebSocket-triggered download path.
      await expect(
        getTaskElement(clientB, taskName).locator('.play-indicator'),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (clients?.clientA) await closeClient(clients.clientA);
      if (clients?.clientB) await closeClient(clients.clientB);
    }
  });

  test('adopts a running focus session when opened on the other client', async ({
    browser,
    baseURL,
    testRunId,
  }) => {
    test.setTimeout(180000);

    let clients: SharedClients | null = null;
    try {
      clients = await createSharedClients(browser, baseURL, testRunId);
      const { clientA, clientB, taskName } = clients;

      await startTimeTracking(clientA, taskName);

      const focusButtonA = clientA.page
        .getByRole('button')
        .filter({ hasText: 'center_focus_strong' });
      await focusButtonA.click();
      await expect(clientA.page.locator('focus-mode-overlay')).toBeVisible({
        timeout: 5000,
      });

      const startFocusButton = clientA.page.locator('focus-mode-main button.play-button');
      await expect(startFocusButton).toBeVisible({ timeout: 5000 });
      await startFocusButton.click();
      await expect(
        clientA.page.locator('focus-mode-main .complete-session-btn'),
      ).toBeVisible({ timeout: 15000 });

      const focusButtonB = clientB.page
        .getByRole('button')
        .filter({ hasText: 'center_focus_strong' });
      await focusButtonB.click();
      await expect(clientB.page.locator('focus-mode-overlay')).toBeVisible({
        timeout: 5000,
      });

      await expect(
        clientB.page.getByRole('button', { name: 'Take over on this device' }),
      ).toBeVisible({ timeout: 10000 });
      await clientB.page
        .getByRole('button', { name: 'Take over on this device' })
        .click();
      await expect(
        clientB.page.locator('focus-mode-main .complete-session-btn'),
      ).toBeVisible({ timeout: 5000 });
      await expect(
        clientA.page.getByRole('button', { name: 'Take over on this device' }),
      ).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (clients?.clientA) await closeClient(clients.clientA);
      if (clients?.clientB) await closeClient(clients.clientB);
    }
  });
});
