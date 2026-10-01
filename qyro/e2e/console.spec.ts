import { expect, test } from '@playwright/test';

test('admin can open the assurance console', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Password').fill('Admin@QYRO123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Control Assurance' })).toBeVisible();
  await page.getByRole('link', { name: 'Agent Discovery' }).click();
  await expect(page.getByRole('heading', { name: 'Agent Discovery' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'LLM model' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Discovered' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Identified' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  await expect(page.getByRole('table').getByText('Clinical Document Analyzer')).toHaveCount(0);
  await page.getByRole('link', { name: 'Runtime Behavior' }).click();
  await expect(page.getByRole('heading', { name: 'Runtime Behavior' })).toBeVisible();
});
