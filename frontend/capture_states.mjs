import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/32583/.gemini/antigravity/brain/84d6e3d2-8bd5-4003-be73-68af085c57eb/screenshots';
const DOCS_DIR = 'e:/Projects/lingshan-ai-guide-Mao123-doc/docs/command-center-screenshots/before';

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

async function getAdminToken() {
  const resp = await fetch('http://localhost:8010/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'lingshan2026' }),
  });
  const data = await resp.json();
  return data.access_token;
}

async function triggerDemo(token, demoId) {
  const resp = await fetch(`http://localhost:8010/api/v1/safety/demo/${demoId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  return await resp.json();
}

async function checkOverflow(page) {
  return await page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
    const clientWidth = window.innerWidth;
    return {
      scrollWidth,
      clientWidth,
      hasOverflow: scrollWidth > clientWidth,
      diff: scrollWidth - clientWidth,
    };
  });
}

async function main() {
  const token = await getAdminToken();
  console.log('Got admin token.');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const scenarios = [
    { id: 'A_normal', name: 'NORMAL', viewports: [{ width: 1440, height: 900, name: '1440' }, { width: 1280, height: 800, name: '1280' }, { width: 390, height: 844, name: '390' }] },
    { id: 'B_exit_fire', name: 'REROUTE', viewports: [{ width: 1440, height: 900, name: '1440' }] },
    { id: 'C_capacity_shortage', name: 'REJECT', viewports: [{ width: 1440, height: 900, name: '1440' }] },
  ];

  for (const scen of scenarios) {
    console.log(`Triggering ${scen.id} (${scen.name})...`);
    await triggerDemo(token, scen.id);
    await new Promise(r => setTimeout(r, 600));

    for (const vp of scen.viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', err => {
        consoleErrors.push(err.message);
      });

      // inject admin_token before navigation
      await page.addInitScript(t => {
        localStorage.setItem('admin_token', t);
      }, token);

      await page.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle' });
      await page.waitForSelector('[role="status"]', { timeout: 10000 });
      // wait a bit for SVG / layout render
      await page.waitForTimeout(1000);

      const statusText = await page.$eval('[role="status"]', el => el.textContent?.trim());
      console.log(`  State badge on page [${vp.name}px]: "${statusText}"`);

      const overflow = await checkOverflow(page);
      console.log(`  Overflow check [${vp.name}px]:`, overflow);

      const filename = `before_${scen.name.toLowerCase()}_${vp.name}.png`;
      const docPath = path.join(DOCS_DIR, filename);
      const artPath = path.join(ARTIFACT_DIR, filename);

      await page.screenshot({ path: docPath, fullPage: true });
      fs.copyFileSync(docPath, artPath);
      console.log(`  Saved screenshot: ${filename}`);

      if (consoleErrors.length > 0) {
        console.log(`  Console errors for [${scen.name} ${vp.name}]:`, consoleErrors);
      }

      await context.close();
    }
  }

  await browser.close();
  console.log('All baseline screenshots captured.');
}

main().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
