import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACT_DIR = path.resolve('artifacts/playwright/cycle05-ux');
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');
const LOG_PATH = path.join(ARTIFACT_DIR, 'ui-validation.log');
const DEV_LOG_PATH = path.join(ARTIFACT_DIR, 'dev-server.log');

const ROUTES = [
  {
    index: '01',
    name: 'channel-minimal',
    route: '/dashboard/channel',
    checks: [
      { kind: 'heading', name: /番組表ヒット取得/ },
      { kind: 'button', name: /1週間の番組表を取得してヒット抽出/ }
    ]
  },
  {
    index: '02',
    name: 'keywords-discovery-minimal',
    route: '/dashboard/keywords/discovery',
    checks: [
      { kind: 'heading', name: /出演ヒット全件キーワード調査/ },
      { kind: 'button', name: /出演ヒット全件をキーワード調査/ }
    ]
  }
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.writeFileSync(LOG_PATH, `Cycle05 minimal UX validation start: ${new Date().toISOString()}\n`, 'utf8');

const appendLog = (line) => fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');

function stopProcess(proc) {
  if (!proc || typeof proc.pid !== 'number') return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    proc.kill('SIGTERM');
  } catch {
    // ignore cleanup errors
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

async function ensureActiveSite(page) {
  const selector = page.locator('.site-switcher select#siteId').first();
  if ((await selector.count()) === 0) return false;
  const current = await selector.inputValue();
  if (current) return true;

  const options = await selector.locator('option').all();
  for (const option of options) {
    const value = await option.getAttribute('value');
    if (value && value.trim()) {
      await selector.selectOption(value.trim());
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

function screenshotPath(index, name) {
  return path.join(SCREENSHOT_DIR, `${index}_${name}.png`);
}

let failed = false;
let devProc = null;

try {
  devProc = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  for (const route of ROUTES) {
    try {
      const response = await page.goto(`${BASE_URL}${route.route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      const status = response?.status() ?? 0;
      await ensureActiveSite(page);
      await page.waitForTimeout(700);

      const hasFlowGuide = (await page.locator('[data-flow-guide="main"]').count()) > 0;
      let hasAllChecks = hasFlowGuide;

      for (const check of route.checks) {
        if (check.kind === 'heading') {
          const ok = (await page.getByRole('heading', { name: check.name }).count()) > 0;
          hasAllChecks = hasAllChecks && ok;
          appendLog(`INFO route=${route.route} heading=${String(check.name)} ok=${ok}`);
        } else if (check.kind === 'button') {
          const ok = (await page.getByRole('button', { name: check.name }).count()) > 0;
          hasAllChecks = hasAllChecks && ok;
          appendLog(`INFO route=${route.route} button=${String(check.name)} ok=${ok}`);
        }
      }

      const ok = status > 0 && status < 400 && hasAllChecks;
      if (!ok) failed = true;
      const screenshot = screenshotPath(route.index, route.name);
      await page.screenshot({ path: screenshot, fullPage: true });
      appendLog(
        `${ok ? 'PASS' : 'FAIL'} route=${route.route} status=${status} hasFlowGuide=${hasFlowGuide} screenshot=${screenshot}`
      );
    } catch (error) {
      failed = true;
      appendLog(`FAIL route=${route.route} error=${String(error)}`);
    }
  }

  await browser.close();
} catch (error) {
  failed = true;
  appendLog(`FAIL fatal=${String(error)}`);
} finally {
  if (devProc) stopProcess(devProc);
  appendLog(`Cycle05 minimal UX validation end: ${new Date().toISOString()}`);
}

if (failed) process.exitCode = 1;
