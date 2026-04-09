import { test, expect } from '@playwright/test';

test('loads the tuner and opens the tuning drawer', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#mic-button')).toContainText('Tap to tune');
  await expect(page.locator('.string-btn')).toHaveCount(6);

  await page.click('#tuning-toggle');

  await expect(page.locator('#tuning-drawer')).toHaveClass(/open/);
  await expect(page.locator('#tuning-list .tuning-drawer-item')).toHaveCount(10);
  await expect(page.locator('#tuning-list')).toContainText('Drop C');
  await expect(page.locator('#tuning-list')).toContainText('C Standard');

  await page.locator('#tuning-list .tuning-drawer-item', { hasText: 'Drop C' }).click();
  await expect(page.locator('#low-btn')).toHaveClass(/active/);
});
