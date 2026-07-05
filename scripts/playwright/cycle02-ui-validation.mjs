import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACT_DIR = path.resolve('artifacts/playwright/phase2');
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');
const UI_LOG_PATH = path.join(ARTIFACT_DIR, 'ui-validation.log');
const DEV_LOG_PATH = path.join(ARTIFACT_DIR, 'dev-server.log');

const ROUTES = [
  '/dashboard/radar/trend',
  '/dashboard/radar/program',
  '/dashboard/radar/news',
  '/dashboard/keywords/discovery'
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.writeFileSync(UI_LOG_PATH, `Cycle02 UI validation start: ${new Date().toISOString()}\n`, 'utf8');
fs.writeFileSync(DEV_LOG_PATH, `Cycle02 dev log start: ${new Date().toISOString()}\n`, 'utf8');

const appendUiLog = (line) => fs.appendFileSync(UI_LOG_PATH, `${line}\n`, 'utf8');
const toName = (label) =>
  label.replace(/^\//, '').replace(/\//g, '__').replace(/[^a-zA-Z0-9_\-.]/g, '_') + '.png';

function stopDevServerProcess(proc) {
  if (!proc || typeof proc.pid !== 'number') return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    proc.kill('SIGTERM');
  } catch {
    // ignore shutdown failures in cleanup path
  }
}

async function waitForServer(timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(BASE_URL, { redirect: 'manual' });
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureServer() {
  const alreadyUp = await waitForServer(1500);
  if (alreadyUp) {
    appendUiLog(`INFO dev-server already running at ${BASE_URL}`);
    return { proc: null };
  }

  appendUiLog('INFO starting npm run dev');
  const proc = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    shell: true,
    env: process.env
  });

  const stream = fs.createWriteStream(DEV_LOG_PATH, { flags: 'a' });
  proc.stdout.on('data', (chunk) => stream.write(chunk));
  proc.stderr.on('data', (chunk) => stream.write(chunk));
  proc.on('exit', (code) => {
    stream.write(`\n[dev-server-exit] code=${code}\n`);
    stream.end();
  });

  const up = await waitForServer(120000);
  if (!up) {
    stopDevServerProcess(proc);
    throw new Error(`dev server was not ready within timeout: ${BASE_URL}`);
  }
  return { proc };
}

let hasFailure = false;
let devProc = null;

try {
  const dev = await ensureServer();
  devProc = dev.proc;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    const shotPath = path.join(SCREENSHOT_DIR, toName(route));
    try {
      const response = await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
      const status = response?.status() ?? 0;
      const failed = status >= 400 || status === 0;
      if (failed) hasFailure = true;
      await page.waitForTimeout(500);
      await page.screenshot({ path: shotPath, fullPage: true });
      appendUiLog(`${failed ? 'FAIL' : 'PASS'} route=${route} status=${status} url=${page.url()} screenshot=${shotPath}`);
    } catch (error) {
      hasFailure = true;
      appendUiLog(`FAIL route=${route} status=0 url=${url} error=${String(error)}`);
    }
  }

  let keywordDetailPath = '/dashboard/keywords/demo-keyword';
  try {
    await page.goto(`${BASE_URL}/dashboard/keywords/discovery`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
    const firstKeywordLink = page
      .locator('section[data-page="keywords-discovery"] tbody a[href*="/dashboard/keywords/"]')
      .first();
    const href = await firstKeywordLink.getAttribute('href');
    if (href) {
      keywordDetailPath = href.startsWith('http')
        ? new URL(href).pathname + (new URL(href).search || '')
        : href;
    }
  } catch {
    // keep fallback path
  }

  try {
    const detailUrl = `${BASE_URL}${keywordDetailPath}`;
    const detailShotPath = path.join(SCREENSHOT_DIR, toName(keywordDetailPath));
    const response = await page.goto(detailUrl, { waitUntil: 'commit', timeout: 30000 });
    const status = response?.status() ?? 0;
    const failed = status >= 400 || status === 0;
    if (failed) hasFailure = true;
    await page.waitForTimeout(500);
    await page.screenshot({ path: detailShotPath, fullPage: true });
    appendUiLog(
      `${failed ? 'FAIL' : 'PASS'} route=${keywordDetailPath} status=${status} url=${page.url()} screenshot=${detailShotPath}`
    );
  } catch (error) {
    hasFailure = true;
    appendUiLog(`FAIL route=${keywordDetailPath} status=0 url=${BASE_URL}${keywordDetailPath} error=${String(error)}`);
  }

  try {
    await page.goto(`${BASE_URL}/dashboard/radar/trend`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
    const radarCta = page
      .locator('section[data-page="radar-trend"] tbody a[href*="/dashboard/opportunities"]')
      .first();
    if ((await radarCta.count()) === 0) {
      throw new Error('radar CTA link not found');
    }
    await Promise.all([page.waitForURL('**/dashboard/opportunities**', { timeout: 30000 }), radarCta.click()]);
    const shotPath = path.join(SCREENSHOT_DIR, 'cta__radar_to_opportunities.png');
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotPath, fullPage: true });
    appendUiLog(`PASS cta=radar_to_opportunities status=200 url=${page.url()} screenshot=${shotPath}`);
  } catch (error) {
    hasFailure = true;
    appendUiLog(`FAIL cta=radar_to_opportunities status=0 url=${page.url()} error=${String(error)}`);
  }

  try {
    await page.goto(`${BASE_URL}${keywordDetailPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
    const keywordCta = page.locator('[data-testid="keywords-to-opportunities-cta"]').first();
    if ((await keywordCta.count()) === 0) {
      throw new Error('keyword CTA not found by data-testid');
    }
    await Promise.all([page.waitForURL('**/dashboard/opportunities**', { timeout: 30000 }), keywordCta.click()]);
    const shotPath = path.join(SCREENSHOT_DIR, 'cta__keywords_to_opportunities.png');
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotPath, fullPage: true });
    appendUiLog(`PASS cta=keywords_to_opportunities status=200 url=${page.url()} screenshot=${shotPath}`);
  } catch (error) {
    hasFailure = true;
    appendUiLog(`FAIL cta=keywords_to_opportunities status=0 url=${page.url()} error=${String(error)}`);
  }

  await browser.close();
} catch (error) {
  hasFailure = true;
  appendUiLog(`FAIL fatal error=${String(error)}`);
} finally {
  if (devProc) {
    stopDevServerProcess(devProc);
  }
  appendUiLog(`Cycle02 UI validation end: ${new Date().toISOString()}`);
}

if (hasFailure) {
  process.exitCode = 1;
}
