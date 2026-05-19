import { test, expect } from '@playwright/test';
import { setupTauriMock } from './tauri-mock';

test('activity feed loads recent items from DB on startup', async ({ page }) => {
  const fiveMinAgo = Math.floor(Date.now() / 1000) - 300;

  await setupTauriMock(page, {
    get_recent_activity: [
      {
        action_id: 'act-db-1',
        file_id: 'file-db-1',
        name: 'rapport-annuel.pdf',
        path_before: '/Users/test/Downloads/rapport-annuel.pdf',
        path_after: '/Users/test/Documents/rapport-annuel.pdf',
        category: 'document',
        timestamp: fiveMinAgo,
      },
    ],
  });

  await page.goto('/');
  await expect(page.getByText('rapport-annuel.pdf', { exact: true }).first()).toBeVisible({ timeout: 8000 });
});
