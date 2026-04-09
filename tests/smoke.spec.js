import { test, expect } from '@playwright/test';

test('loads the tuner and opens the tuning drawer', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#mic-button')).toContainText('Tap to tune');
  await expect(page.locator('#note-target')).toContainText('Standard');
  await expect(page.locator('#status-msg')).toBeVisible();
  await expect(page.locator('.string-btn')).toHaveCount(6);

  await page.click('#guide-btn');
  await expect(page.locator('#guide-btn')).toHaveClass(/active/);
  await expect(page.locator('#note-target')).toContainText('Guide 1/6');

  await page.click('#tuning-toggle');

  await expect(page.locator('#tuning-drawer')).toHaveClass(/open/);
  await expect(page.locator('#tuning-list .tuning-drawer-item')).toHaveCount(10);
  await expect(page.locator('#tuning-list')).toContainText('Drop C');
  await expect(page.locator('#tuning-list')).toContainText('C Standard');

  await page.locator('#tuning-list .tuning-drawer-item', { hasText: 'Drop C' }).click();
  await expect(page.locator('#low-btn')).toHaveClass(/active/);
  await expect(page.locator('#note-target')).toContainText('Guide 1/6');
  await expect(page.locator('.string-btn')).toHaveCount(6);
});

test('mobile layout stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.playback-controls')).toBeVisible();

  const isOverflowing = await page.evaluate(() =>
    document.scrollingElement.scrollWidth > window.innerWidth + 1
  );

  expect(isOverflowing).toBe(false);
});
