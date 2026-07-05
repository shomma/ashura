import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const ARTIFACT_DIR = path.resolve('artifacts/playwright/cycle01-ux');
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');
const LOG_PATH = path.join(ARTIFACT_DIR, 'ui-validation.log');
const DEV_LOG_PATH = path.join(ARTIFACT_DIR, 'dev-server.log');

const ROUTES = [
  '/dashboard/command-center',
  '/dashboard/opportunities',
  '/dashboard/tasks',
  '/dashboard/channel',
  '/dashboard/prompt-library',
  '/dashboard/reference-store',
  '/dashboard/keywords/discovery',
  '/dashboard/insights/seo',
  '/dashboard/channel'
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.writeFileSync(LOG_PATH, `Cycle01 UX validation start: ${new Date().toISOString()}\n`, 'utf8');

const appendLog = (line) => fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');
const toName = (label) =>
  label.replace(/^\//, '').replace(/\//g, '__').replace(/[^a-zA-Z0-9_.-]/g, '_') + '.png';

function stopProcess(proc) {
  if (!proc || typeof proc.pid !== 'number') return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    proc.kill('SIGTERM');
  } catch {
    // ignore
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
  const log = fs.createWriteStream(DEV_LOG_PATH, { flags: 'a' });
  proc.stdout.on('data', (chunk) => log.write(chunk));
  proc.stderr.on('data', (chunk) => log.write(chunk));

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

  for (const route of ROUTES) {
    try {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const status = res?.status() ?? 0;
      const ok = status > 0 && status < 400;
      if (!ok) failed = true;
      await page.waitForTimeout(600);
      const shot = path.join(SCREENSHOT_DIR, toName(route));
      await page.screenshot({ path: shot, fullPage: true });
      appendLog(`${ok ? 'PASS' : 'FAIL'} route=${route} status=${status} screenshot=${shot}`);
    } catch (error) {
      failed = true;
      appendLog(`FAIL route=${route} error=${String(error)}`);
    }
  }

  try {
    await page.goto(`${BASE_URL}/dashboard/opportunities`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const detailHref = await page.locator('a[href*="/dashboard/opportunities/"]').first().getAttribute('href');
    if (!detailHref) {
      failed = true;
      appendLog('FAIL opportunities detail link not found');
    } else {
      const detailPath = detailHref.startsWith('http')
        ? new URL(detailHref).pathname + new URL(detailHref).search
        : detailHref;
      const res = await page.goto(`${BASE_URL}${detailPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const status = res?.status() ?? 0;
      const whyVisible = (await page.getByText(/Why|閭梧勹/i).count()) > 0;
      const evidenceVisible = (await page.getByText(/Evidence|譬ｹ諡/i).count()) > 0;
      const impactVisible = (await page.getByText(/Impact|譛溷ｾ・柑譫・/i).count()) > 0;
      const confidenceVisible = (await page.getByText(/Confidence|遒ｺ蠎ｦ/i).count()) > 0;
      const ok = status > 0 && status < 400 && whyVisible && evidenceVisible && impactVisible && confidenceVisible;
      if (!ok) failed = true;
      const shot = path.join(SCREENSHOT_DIR, toName(detailPath));
      await page.screenshot({ path: shot, fullPage: true });
      appendLog(`${ok ? 'PASS' : 'FAIL'} route=${detailPath} status=${status} screenshot=${shot}`);
    }
  } catch (error) {
    failed = true;
    appendLog(`FAIL opportunity detail verification error=${String(error)}`);
  }

  await browser.close();
} catch (error) {
  failed = true;
  appendLog(`FAIL fatal=${String(error)}`);
} finally {
  if (devProc) stopProcess(devProc);
  appendLog(`Cycle01 UX validation end: ${new Date().toISOString()}`);
}

if (failed) process.exitCode = 1;
