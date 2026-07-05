import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.resolve('artifacts/playwright/cycle01/screenshots');
const LOG_PATH = path.resolve('artifacts/playwright/cycle01/ui-validation.log');

const targets = [
  '/dashboard/command-center',
  '/dashboard/opportunities'
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
fs.writeFileSync(LOG_PATH, `Cycle01 UI validation start: ${new Date().toISOString()}\n`, 'utf8');

const appendLog = (line) => {
  fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');
};

const toFileName = (route) =>
  route
    .replace(/^\//, '')
    .replace(/\//g, '__')
    .replace(/[^a-zA-Z0-9_\-.]/g, '_') + '.png';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let hasFailure = false;

for (const route of targets) {
  const url = `${BASE_URL}${route}`;
  const filePath = path.join(OUTPUT_DIR, toFileName(route));
  try {
    const response = await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
    const status = response?.status() ?? 0;
    const failed = status >= 400 || status === 0;
    if (failed) {
      hasFailure = true;
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: filePath, fullPage: true });
    appendLog(`${failed ? 'FAIL' : 'PASS'} ${route} status=${status} screenshot=${filePath}`);
  } catch (error) {
    hasFailure = true;
    try {
      await page.screenshot({ path: filePath, fullPage: true });
    } catch {
      // ignore screenshot secondary failures
    }
    appendLog(`FAIL ${route} error=${String(error)}`);
  }
}

try {
  const listUrl = `${BASE_URL}/dashboard/opportunities`;
  const response = await page.goto(listUrl, { waitUntil: 'commit', timeout: 30000 });
  const status = response?.status() ?? 0;
  if (status >= 400 || status === 0) {
    hasFailure = true;
    appendLog(`FAIL /dashboard/opportunities status=${status}`);
  } else {
    await page.waitForTimeout(600);
    const detailLink = page.locator('a[href*="/dashboard/opportunities/"]').first();
    const detailHref = await detailLink.getAttribute('href');
    if (!detailHref) {
      hasFailure = true;
      appendLog('FAIL /dashboard/opportunities detail-link-missing');
    } else {
      const detailPath = detailHref.startsWith('http') ? new URL(detailHref).pathname + new URL(detailHref).search : detailHref;
      const detailFilePath = path.join(OUTPUT_DIR, toFileName(detailPath));
      const detailResponse = await page.goto(`${BASE_URL}${detailPath}`, {
        waitUntil: 'commit',
        timeout: 30000
      });
      const detailStatus = detailResponse?.status() ?? 0;
      const detailFailed = detailStatus >= 400 || detailStatus === 0;
      if (detailFailed) hasFailure = true;
      await page.waitForTimeout(600);
      await page.screenshot({ path: detailFilePath, fullPage: true });
      appendLog(`${detailFailed ? 'FAIL' : 'PASS'} ${detailPath} status=${detailStatus} screenshot=${detailFilePath}`);

      const taskButton = page
        .locator('button')
        .filter({ hasText: /Task|Create/i })
        .first();
      if ((await taskButton.count()) === 0) {
        hasFailure = true;
        appendLog(`FAIL ${detailPath} task-cta-missing`);
      } else {
        await Promise.all([page.waitForURL('**/dashboard/tasks/**', { timeout: 30000 }), taskButton.click()]);
        const taskPath = new URL(page.url()).pathname + new URL(page.url()).search;
        const taskFilePath = path.join(OUTPUT_DIR, toFileName(taskPath));
        await page.waitForTimeout(400);
        await page.screenshot({ path: taskFilePath, fullPage: true });
        appendLog(`PASS transition opportunities-to-task ${taskPath} screenshot=${taskFilePath}`);
      }
    }
  }
} catch (error) {
  hasFailure = true;
  appendLog(`FAIL transition opportunities-to-task error=${String(error)}`);
}

await browser.close();
appendLog(`Cycle01 UI validation end: ${new Date().toISOString()}`);

if (hasFailure) {
  process.exitCode = 1;
}
