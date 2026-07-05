import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACT_DIR = path.resolve('artifacts/playwright/cycle04-ux');
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');
const LOG_PATH = path.join(ARTIFACT_DIR, 'ui-validation.log');
const DEV_LOG_PATH = path.join(ARTIFACT_DIR, 'dev-server.log');

const PRIMARY_ROUTES = [
  { index: '01', name: 'command-center', route: '/dashboard/command-center' },
  { index: '02', name: 'opportunities', route: '/dashboard/opportunities' },
  { index: '03', name: 'tasks', route: '/dashboard/tasks' },
  { index: '04', name: 'channel-planner', route: '/dashboard/channel' },
  { index: '05', name: 'prompt-library', route: '/dashboard/prompt-library' },
  { index: '06', name: 'reference-store', route: '/dashboard/reference-store' }
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.writeFileSync(LOG_PATH, `Cycle04 UX validation start: ${new Date().toISOString()}\n`, 'utf8');

const appendLog = (line) => fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');

function shotPath(index, name) {
  return path.join(SCREENSHOT_DIR, `${index}_${name}.png`);
}

function stopProcess(proc) {
  if (!proc || typeof proc.pid !== 'number') return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    proc.kill('SIGTERM');
  } catch {
    // ignore cleanup failures
  }
}

async function waitForServer(timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
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
  if (await waitForServer(1500)) {
    appendLog(`INFO dev server already running at ${BASE_URL}`);
    return null;
  }

  fs.writeFileSync(DEV_LOG_PATH, `dev start: ${new Date().toISOString()}\n`, 'utf8');
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

  const ready = await waitForServer(120000);
  if (!ready) {
    stopProcess(proc);
    throw new Error(`dev server did not start: ${BASE_URL}`);
  }
  return proc;
}

let failed = false;
let devProc = null;

try {
  devProc = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  for (const item of PRIMARY_ROUTES) {
    try {
      const res = await page.goto(`${BASE_URL}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const status = res?.status() ?? 0;
      let ok = status > 0 && status < 400;
      if (!ok) failed = true;
      await page.waitForTimeout(600);
      const screenshot = shotPath(item.index, item.name);
      await page.screenshot({ path: screenshot, fullPage: true });
      appendLog(`${ok ? 'PASS' : 'FAIL'} check=${item.index} route=${item.route} status=${status} screenshot=${screenshot}`);
    } catch (error) {
      failed = true;
      appendLog(`FAIL check=${item.index} route=${item.route} error=${String(error)}`);
    }
  }

  let keywordDetailPath = '/dashboard/keywords/demo-keyword';
  try {
    await page.goto(`${BASE_URL}/dashboard/keywords/discovery`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
    const href = await page
      .locator('section[data-page="keywords-discovery"] tbody a[href*="/dashboard/keywords/"]')
      .first()
      .getAttribute('href');
    if (href) {
      keywordDetailPath = href.startsWith('http')
        ? new URL(href).pathname + (new URL(href).search || '')
        : href;
    }
  } catch {
    // keep fallback path
  }

  try {
    if (keywordDetailPath.endsWith('/keywords/discovery')) {
      keywordDetailPath = '/dashboard/keywords/demo-keyword';
    }
    const res = await page.goto(`${BASE_URL}${keywordDetailPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = res?.status() ?? 0;
    const hasGraphHeading = (await page.getByText(/Keyword Graph/i).count()) > 0;
    const ok = status > 0 && status < 400 && hasGraphHeading;
    if (!ok) failed = true;
    await page.waitForTimeout(500);
    const screenshot = shotPath('07', 'keyword-graph');
    await page.screenshot({ path: screenshot, fullPage: true });
    appendLog(
      `${ok ? 'PASS' : 'FAIL'} check=07 route=${keywordDetailPath} status=${status} hasKeywordGraph=${hasGraphHeading} screenshot=${screenshot}`
    );
  } catch (error) {
    failed = true;
    appendLog(`FAIL check=07 route=${keywordDetailPath} error=${String(error)}`);
  }

  try {
    await page.goto(`${BASE_URL}/dashboard/opportunities`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    let detailPath = '/dashboard/opportunities/demo-opportunity';
    const href = await page.locator('a[href*="/dashboard/opportunities/"]').first().getAttribute('href');
    if (href) {
      detailPath = href.startsWith('http') ? new URL(href).pathname + (new URL(href).search || '') : href;
    }

    const res = await page.goto(`${BASE_URL}${detailPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = res?.status() ?? 0;
    const hasWhy = (await page.getByText(/Why/i).count()) > 0;
    const hasEvidence = (await page.getByText(/Evidence/i).count()) > 0;
    const hasImpact = (await page.getByText(/Impact/i).count()) > 0;
    const hasConfidence = (await page.getByText(/Confidence/i).count()) > 0;
    const ok = status > 0 && status < 400 && hasWhy && hasEvidence && hasImpact && hasConfidence;
    if (!ok) failed = true;
    await page.waitForTimeout(500);
    const screenshot = shotPath('08', 'opportunity-detail');
    await page.screenshot({ path: screenshot, fullPage: true });
    appendLog(
      `${ok ? 'PASS' : 'FAIL'} check=08 route=${detailPath} status=${status} why=${hasWhy} evidence=${hasEvidence} impact=${hasImpact} confidence=${hasConfidence} screenshot=${screenshot}`
    );
  } catch (error) {
    failed = true;
    appendLog(`FAIL check=08 route=/dashboard/opportunities/[id] error=${String(error)}`);
  }

  await browser.close();
} catch (error) {
  failed = true;
  appendLog(`FAIL fatal=${String(error)}`);
} finally {
  if (devProc) stopProcess(devProc);
  appendLog(`Cycle04 UX validation end: ${new Date().toISOString()}`);
}

if (failed) process.exitCode = 1;

