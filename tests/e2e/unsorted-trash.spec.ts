import { test, expect } from '@playwright/test';
import { setupTauriMock } from './tauri-mock';

test('trashing a file from the unsorted view removes it from the list', async ({ page }) => {
  await setupTauriMock(page, {
    get_unsorted_files: [
      {
        id: 'unsorted-1',
        name: 'facture-old.pdf',
        path: '/Users/test/Downloads/facture-old.pdf',
        extension: 'pdf',
        size_bytes: 102400,
        category: null,
        subcategory: null,
        confidence: null,
      },
    ],
    trash_file: null,
  });

  await page.goto('/');

  // Navigate to the "À valider" view
  await page.getByRole('button', { name: 'À valider' }).click();

  // Verify the file appears in the list
  await expect(page.getByText('facture-old.pdf', { exact: true })).toBeVisible({ timeout: 5000 });

  // Right-click to open context menu
  await page.getByText('facture-old.pdf', { exact: true }).click({ button: 'right' });

  // Click "Supprimer" in the context menu
  await page.getByRole('button', { name: 'Supprimer' }).click();

  // After fix: file should disappear from the list
  await expect(page.getByText('facture-old.pdf', { exact: true })).not.toBeVisible({ timeout: 3000 });
});
