import { test, expect } from '@playwright/test';
import { setupTauriMock } from './tauri-mock';

// ─── Mock data ───────────────────────────────────────────────────────────────

const TWO_FILES = [
  { id: 'f1', name: 'photo1.jpg', path: '/tmp/photo1.jpg', category: 'photo', size_bytes: 1024, modified_at: 1700000000 },
  { id: 'f2', name: 'photo2.jpg', path: '/tmp/photo2.jpg', category: 'photo', size_bytes: 2048, modified_at: 1700000100 },
];

const ONE_RULE = [
  { id: 'r1', name: 'Règle test', condition_type: 'extension', condition_value: 'pdf', target_dir: '~/Documents', auto_tag: null, enabled: true },
];

const TWO_ACTIVITY = [
  { action_id: 'a1', name: 'rapport.pdf', path_before: '/tmp/rapport.pdf', path_after: '/Documents/rapport.pdf', category: 'document', timestamp: 1700000000 },
  { action_id: 'a2', name: 'photo.jpg',   path_before: '/tmp/photo.jpg',   path_after: '/Photos/photo.jpg',      category: 'photo',    timestamp: 1700000100 },
];

const TWO_UNSORTED = [
  { id: 'u1', name: 'doc.txt',  path: '/tmp/doc.txt',  extension: 'txt',  size_bytes: 512,   category: 'document', subcategory: null, confidence: 0.9 },
  { id: 'u2', name: 'vid.mp4', path: '/tmp/vid.mp4', extension: 'mp4', size_bytes: 10240, category: 'video',    subcategory: null, confidence: 0.8 },
];

// ─── Explorer Sidebar ─────────────────────────────────────────────────────────

test.describe('Explorer – Sidebar keyboard navigation', () => {
  // Default view is 'dashboard'; default selectedCategory is 'document' (Documents is 4th = index 3)
  // After navigating to Explorer, ArrowDown moves from 'document' → 'archive' (5th)

  async function goToExplorer(page: Parameters<typeof setupTauriMock>[0]) {
    await page.getByRole('button', { name: 'Explorer' }).click();
    // Wait for Explorer category sidebar to be visible
    await expect(page.locator('.w-44')).toBeVisible({ timeout: 5000 });
  }

  test('↓ moves to next category (Documents → Archives)', async ({ page }) => {
    await setupTauriMock(page, { get_files_by_category: [] });
    await page.goto('/');
    await goToExplorer(page);

    // Initial state: "Documents" should be selected (bg-zinc-700) — default selectedCategory is 'document'
    const documentsCat = page.locator('button', { hasText: 'Documents' });
    await expect(documentsCat).toHaveClass(/bg-zinc-700/);

    // Press ↓ → "Archives" becomes active
    await page.keyboard.press('ArrowDown');

    const archivesCat = page.locator('button', { hasText: 'Archives' });
    await expect(archivesCat).toHaveClass(/bg-zinc-700/);
    await expect(documentsCat).not.toHaveClass(/bg-zinc-700/);
  });

  test('↑ after ↓ returns to previous category', async ({ page }) => {
    await setupTauriMock(page, { get_files_by_category: [] });
    await page.goto('/');
    await goToExplorer(page);

    const documentsCat = page.locator('button', { hasText: 'Documents' });
    await expect(documentsCat).toHaveClass(/bg-zinc-700/);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    await expect(documentsCat).toHaveClass(/bg-zinc-700/);
  });

  test('↑ at the top does not go above 1st category', async ({ page }) => {
    await setupTauriMock(page, { get_files_by_category: [] });
    await page.goto('/');
    await goToExplorer(page);

    // Navigate to the top (Photos = first category, index 0)
    // Default is 'document' (index 3), press ↑ 3 times to reach top
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');

    const photosCat = page.locator('button', { hasText: 'Photos' });
    await expect(photosCat).toHaveClass(/bg-zinc-700/);

    // One more ↑ should stay at Photos (index 0)
    await page.keyboard.press('ArrowUp');
    await expect(photosCat).toHaveClass(/bg-zinc-700/);
  });

  test('→ switches to filelist when files exist', async ({ page }) => {
    await setupTauriMock(page, { get_files_by_category: TWO_FILES });
    await page.goto('/');
    await goToExplorer(page);

    // Wait for files to load
    await expect(page.locator('[data-file-id="f1"]')).toBeVisible({ timeout: 5000 });

    // Sidebar zone should show blue left border
    const categorySidebar = page.locator('.w-44');
    await expect(categorySidebar).toHaveClass(/border-blue-600/);

    // Press → to enter filelist
    await page.keyboard.press('ArrowRight');

    // Sidebar loses blue border
    await expect(categorySidebar).not.toHaveClass(/border-blue-600/);
  });

  test('→ does nothing when no files exist', async ({ page }) => {
    await setupTauriMock(page, { get_files_by_category: [] });
    await page.goto('/');
    await goToExplorer(page);

    const categorySidebar = page.locator('.w-44');
    await expect(categorySidebar).toHaveClass(/border-blue-600/);

    await page.keyboard.press('ArrowRight');

    // Sidebar still keeps blue border
    await expect(categorySidebar).toHaveClass(/border-blue-600/);
  });
});

// ─── Explorer Filelist ────────────────────────────────────────────────────────

test.describe('Explorer – Filelist keyboard navigation', () => {
  async function enterFilelist(page: Parameters<typeof setupTauriMock>[0]) {
    await setupTauriMock(page, { get_files_by_category: TWO_FILES });
    await page.goto('/');
    // Navigate to Explorer view first (default is dashboard)
    await page.getByRole('button', { name: 'Explorer' }).click();
    await expect(page.locator('[data-file-id="f1"]')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('ArrowRight');
  }

  test('↓ selects 1st file (bg-zinc-700 highlight)', async ({ page }) => {
    await enterFilelist(page);

    await page.keyboard.press('ArrowDown');

    const firstFile = page.locator('[data-file-id="f1"]');
    await expect(firstFile).toHaveClass(/bg-zinc-700/);
  });

  test('↓↓ selects 2nd file', async ({ page }) => {
    await enterFilelist(page);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    const secondFile = page.locator('[data-file-id="f2"]');
    await expect(secondFile).toHaveClass(/bg-zinc-700/);
    const firstFile = page.locator('[data-file-id="f1"]');
    await expect(firstFile).not.toHaveClass(/bg-zinc-700/);
  });

  test('← from filelist returns focus to sidebar', async ({ page }) => {
    await enterFilelist(page);
    await page.keyboard.press('ArrowDown');

    // Press ← → should return to sidebar
    await page.keyboard.press('ArrowLeft');

    const categorySidebar = page.locator('.w-44');
    await expect(categorySidebar).toHaveClass(/border-blue-600/);
  });

  test('Escape from filelist clears selection and returns to sidebar', async ({ page }) => {
    await enterFilelist(page);
    await page.keyboard.press('ArrowDown');

    // Confirm file is selected
    const firstFile = page.locator('[data-file-id="f1"]');
    await expect(firstFile).toHaveClass(/bg-zinc-700/);

    // Press Escape
    await page.keyboard.press('Escape');

    // File should no longer be highlighted
    await expect(firstFile).not.toHaveClass(/bg-zinc-700/);

    // Sidebar should regain blue border
    const categorySidebar = page.locator('.w-44');
    await expect(categorySidebar).toHaveClass(/border-blue-600/);
  });
});

// ─── À valider (Unsorted) ─────────────────────────────────────────────────────

test.describe('À valider – keyboard navigation', () => {
  test('↓ highlights the 2nd file (ring visible)', async ({ page }) => {
    await setupTauriMock(page, { get_unsorted_files: TWO_UNSORTED });
    await page.goto('/');

    await page.getByRole('button', { name: 'À valider' }).click();

    // Both files should be visible
    await expect(page.getByText('doc.txt', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('vid.mp4', { exact: true })).toBeVisible({ timeout: 5000 });

    // Initially idx=0 is focused (first file has ring)
    const firstItem = page.locator('[data-unsorted-idx="0"]');
    await expect(firstItem).toHaveClass(/ring-blue-600\/40/);

    // Press ↓ → second item gets ring
    await page.keyboard.press('ArrowDown');
    const secondItem = page.locator('[data-unsorted-idx="1"]');
    await expect(secondItem).toHaveClass(/ring-blue-600\/40/);
    await expect(firstItem).not.toHaveClass(/ring-blue-600\/40/);
  });

  test('Escape dismisses the focused file', async ({ page }) => {
    await setupTauriMock(page, { get_unsorted_files: TWO_UNSORTED });
    await page.goto('/');

    await page.getByRole('button', { name: 'À valider' }).click();
    await expect(page.getByText('doc.txt', { exact: true })).toBeVisible({ timeout: 5000 });

    // Press Escape → first file (idx=0) should be removed
    await page.keyboard.press('Escape');

    await expect(page.getByText('doc.txt', { exact: true })).not.toBeVisible({ timeout: 3000 });
    // Second file should still be there
    await expect(page.getByText('vid.mp4', { exact: true })).toBeVisible();
  });

  test('↑ does not go above 0', async ({ page }) => {
    await setupTauriMock(page, { get_unsorted_files: TWO_UNSORTED });
    await page.goto('/');

    await page.getByRole('button', { name: 'À valider' }).click();
    await expect(page.getByText('doc.txt', { exact: true })).toBeVisible({ timeout: 5000 });

    // ↑ on first item should stay on first
    await page.keyboard.press('ArrowUp');
    const firstItem = page.locator('[data-unsorted-idx="0"]');
    await expect(firstItem).toHaveClass(/ring-blue-600\/40/);
  });
});

// ─── Règles ───────────────────────────────────────────────────────────────────

test.describe('Règles – keyboard navigation', () => {
  test('↓ focuses first rule (ring-blue-500 visible)', async ({ page }) => {
    await setupTauriMock(page, { get_rules: ONE_RULE });
    await page.goto('/');

    await page.getByRole('button', { name: 'Règles' }).click();

    // Wait for rule to be visible
    await expect(page.getByText('Règle test')).toBeVisible({ timeout: 5000 });

    // No rule focused initially
    const ruleEl = page.locator('.ring-blue-500');
    await expect(ruleEl).toHaveCount(0);

    // Press ↓ → rule gets focus ring
    await page.keyboard.press('ArrowDown');

    await expect(page.locator('.ring-blue-500')).toHaveCount(1);
    await expect(page.locator('.ring-blue-500')).toContainText('Règle test');
  });

  test('Escape deselects the focused rule', async ({ page }) => {
    await setupTauriMock(page, { get_rules: ONE_RULE });
    await page.goto('/');

    await page.getByRole('button', { name: 'Règles' }).click();
    await expect(page.getByText('Règle test')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.ring-blue-500')).toHaveCount(1);

    // Press Escape → ring should disappear
    await page.keyboard.press('Escape');
    await expect(page.locator('.ring-blue-500')).toHaveCount(0);
  });

  test('Enter with focused rule opens inline edit form', async ({ page }) => {
    await setupTauriMock(page, { get_rules: ONE_RULE });
    await page.goto('/');

    await page.getByRole('button', { name: 'Règles' }).click();
    await expect(page.getByText('Règle test')).toBeVisible({ timeout: 5000 });

    // Focus the rule
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.ring-blue-500')).toHaveCount(1);

    // Press Enter → edit form opens
    await page.keyboard.press('Enter');

    // Edit form shows "Modifier la règle" header
    await expect(page.getByText('Modifier la règle')).toBeVisible({ timeout: 3000 });
  });
});

// ─── Dashboard ActivityFeed ───────────────────────────────────────────────────

test.describe('Dashboard – ActivityFeed keyboard navigation', () => {
  test('↓ highlights first activity row (ring visible)', async ({ page }) => {
    await setupTauriMock(page, { get_recent_activity: TWO_ACTIVITY });
    await page.goto('/');

    await page.getByRole('button', { name: 'Dashboard' }).click();

    // Wait for activity items to load
    await expect(page.getByText('rapport.pdf', { exact: true })).toBeVisible({ timeout: 5000 });

    // No focused row initially
    const focusedRows = page.locator('[data-activity-idx].ring-1');
    await expect(focusedRows).toHaveCount(0);

    // Press ↓ → first row gets highlighted
    await page.keyboard.press('ArrowDown');

    const firstRow = page.locator('[data-activity-idx="0"]');
    await expect(firstRow).toHaveClass(/ring-blue-600\/40/);
  });

  test('↓↓ highlights second activity row', async ({ page }) => {
    await setupTauriMock(page, { get_recent_activity: TWO_ACTIVITY });
    await page.goto('/');

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page.getByText('rapport.pdf', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    const secondRow = page.locator('[data-activity-idx="1"]');
    await expect(secondRow).toHaveClass(/ring-blue-600\/40/);

    const firstRow = page.locator('[data-activity-idx="0"]');
    await expect(firstRow).not.toHaveClass(/ring-blue-600\/40/);
  });

  test('Escape removes highlight from activity row', async ({ page }) => {
    await setupTauriMock(page, { get_recent_activity: TWO_ACTIVITY });
    await page.goto('/');

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page.getByText('rapport.pdf', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('ArrowDown');
    const firstRow = page.locator('[data-activity-idx="0"]');
    await expect(firstRow).toHaveClass(/ring-blue-600\/40/);

    // Escape removes focus
    await page.keyboard.press('Escape');
    await expect(firstRow).not.toHaveClass(/ring-blue-600\/40/);
  });

  test('focused row shows "annuler" button', async ({ page }) => {
    await setupTauriMock(page, { get_recent_activity: TWO_ACTIVITY });
    await page.goto('/');

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page.getByText('rapport.pdf', { exact: true })).toBeVisible({ timeout: 5000 });

    // "annuler" button should be hidden initially (opacity-0)
    const undoBtn = page.locator('[data-activity-idx="0"] button', { hasText: 'annuler' });

    await page.keyboard.press('ArrowDown');

    // When row is focused, annuler becomes visible (opacity-100)
    await expect(undoBtn).toHaveClass(/opacity-100/);
  });
});
