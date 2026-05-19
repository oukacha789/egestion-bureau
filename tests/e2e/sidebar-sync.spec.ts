import { test, expect } from '@playwright/test';
import { setupTauriMock } from './tauri-mock';

test('sidebar watched-dirs card updates after adding a dir in Preferences', async ({ page }) => {
  await setupTauriMock(page, {
    get_prefs: [],
    get_watch_dirs: [],
    add_watch_dir: ['/Users/test/Downloads'],
    'plugin:dialog|open': '/Users/test/Downloads',
  });

  await page.goto('/');

  // The sidebar is the w-48 panel on the left
  const sidebar = page.locator('.w-48');

  // Navigate to Preferences
  await page.getByRole('button', { name: 'Préférences' }).click();

  // Sidebar initially shows "—" (no watched dirs)
  await expect(sidebar.getByText('—')).toBeVisible();

  // Click "Ajouter un dossier"
  await page.getByRole('button', { name: 'Ajouter un dossier' }).click();

  // After fix: the sidebar "Dossiers surveillés" card should show the new directory
  await expect(sidebar.getByText('Downloads')).toBeVisible({ timeout: 3000 });
});
