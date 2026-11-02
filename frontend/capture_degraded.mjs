import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/32583/.gemini/antigravity/brain/84d6e3d2-8bd5-4003-be73-68af085c57eb/screenshots';
const DOCS_DIR = 'e:/Projects/lingshan-ai-guide-Mao123-doc/docs/command-center-screenshots/before';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="status"]', { timeout: 10000 });
  await page.waitForTimeout(1000);

  const statusText = await page.$eval('[role="status"]', el => el.textContent?.trim());
  console.log(`State on page: "${statusText}"`);

  const docPath = path.join(DOCS_DIR, 'before_degraded_1440.png');
  const artPath = path.join(ARTIFACT_DIR, 'before_degraded_1440.png');
  await page.screenshot({ path: docPath, fullPage: true });
  fs.copyFileSync(docPath, artPath);
  console.log('Saved before_degraded_1440.png');
  await browser.close();
}

main().catch(console.error);
