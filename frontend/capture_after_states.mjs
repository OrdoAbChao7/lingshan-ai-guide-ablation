import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/32583/.gemini/antigravity/brain/84d6e3d2-8bd5-4003-be73-68af085c57eb/screenshots';
const DOCS_DIR = 'e:/Projects/lingshan-ai-guide-Mao123-doc/docs/command-center-screenshots/after';

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

async function triggerDegraded(token) {
  const resp = await fetch('http://localhost:8010/api/v1/safety/observations/simulate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ observations: { R_MAIN: { count: 380, confidence: 0.2 } } }),
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

// Evaluate contrast of text elements against background
async function checkContrast(page) {
  return await page.evaluate(() => {
    function luminance(r, g, b) {
      const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    function parseRgb(colorStr) {
      const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    }

    const textNodes = [];
    const walker = document.createTreeWalker(document.querySelector('.cc-root'), NodeFilter.SHOW_ELEMENT);
    let el;
    let failCount = 0;
    const checked = [];

    while ((el = walker.nextNode())) {
      const style = window.getComputedStyle(el);
      const text = el.textContent?.trim();
      if (!text || el.children.length > 0) continue; // leaf text element
      const fgRgb = parseRgb(style.color);
      if (!fgRgb) continue;

      // walk up for background
      let bgEl = el;
      let bgRgb = null;
      while (bgEl && bgEl !== document.documentElement) {
        const bgStyle = window.getComputedStyle(bgEl);
        const parsed = parseRgb(bgStyle.backgroundColor);
        if (parsed && bgStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && bgStyle.backgroundColor !== 'transparent') {
          bgRgb = parsed;
          break;
        }
        bgEl = bgEl.parentElement;
      }
      if (!bgRgb) bgRgb = [20, 16, 14]; // #14100E fallback

      const l1 = luminance(...fgRgb);
      const l2 = luminance(...bgRgb);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      const fontSize = parseFloat(style.fontSize);
      const isLarge = fontSize >= 18 || (fontSize >= 14 && (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 600));
      const minRatio = isLarge ? 3.0 : 4.5;

      if (ratio < minRatio) {
        failCount++;
        if (checked.length < 5) {
          checked.push({
            tag: el.tagName,
            class: el.className,
            text: text.slice(0, 25),
            ratio: ratio.toFixed(2),
            minRatio,
            fg: style.color,
            bg: `rgb(${bgRgb.join(',')})`,
          });
        }
      }
    }

    return { failCount, sampleFailures: checked };
  });
}

async function main() {
  const token = await getAdminToken();
  console.log('Got admin token.');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const runs = [
    { type: 'demo', id: 'A_normal', name: 'NORMAL', viewports: [{ width: 1440, height: 900, name: '1440' }, { width: 1280, height: 800, name: '1280' }, { width: 390, height: 844, name: '390' }] },
    { type: 'demo', id: 'B_exit_fire', name: 'REROUTE', viewports: [{ width: 1440, height: 900, name: '1440' }] },
    { type: 'demo', id: 'C_capacity_shortage', name: 'REJECT', viewports: [{ width: 1440, height: 900, name: '1440' }] },
    { type: 'degraded', id: 'simulate_degraded', name: 'DEGRADED', viewports: [{ width: 1440, height: 900, name: '1440' }] },
  ];

  for (const scen of runs) {
    console.log(`Setting state for ${scen.name}...`);
    if (scen.type === 'demo') {
      await triggerDemo(token, scen.id);
    } else {
      await triggerDegraded(token);
    }
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

      await page.addInitScript(t => {
        localStorage.setItem('admin_token', t);
      }, token);

      await page.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle' });
      await page.waitForSelector('[role="status"]', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const statusText = await page.$eval('[role="status"]', el => el.textContent?.trim());
      console.log(`  State badge on page [${scen.name} ${vp.name}px]: "${statusText}"`);

      const overflow = await checkOverflow(page);
      console.log(`  Overflow check [${scen.name} ${vp.name}px]:`, overflow);

      const contrast = await checkContrast(page);
      console.log(`  Contrast check [${scen.name} ${vp.name}px]:`, contrast);

      const filename = `after_${scen.name.toLowerCase()}_${vp.name}.png`;
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
  console.log('All AFTER screenshots and verifications completed.');
}

main().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
