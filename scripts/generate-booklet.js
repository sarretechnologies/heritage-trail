// Generates booklet.pdf from index.html#/booklet using headless Chromium.
//
// Usage (locally): npx playwright install chromium && node scripts/generate-booklet.js
// In CI:           run via .github/workflows/booklet.yml

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const indexPath = path.join(repoRoot, 'index.html');
  const fileUrl = 'file://' + indexPath + '#/booklet';
  const outPath = path.join(repoRoot, 'booklet.pdf');

  if (!fs.existsSync(indexPath)) {
    console.error('index.html not found at', indexPath);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture page console for easier debugging in CI
  page.on('console', msg => console.log('[page]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[page error]', err.message));

  console.log('Loading', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Wait for the booklet container to be in the DOM
  await page.waitForSelector('.booklet .bk-cover', { timeout: 15000 });

  // Wait for fonts and images to fully load before snapshotting
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  });

  // Force the print stylesheet (so we render the booklet view, not the screen view)
  await page.emulateMedia({ media: 'print' });

  // Small settle delay for any async layout work
  await page.waitForTimeout(500);

  console.log('Rendering PDF →', outPath);
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-size:8px; width:100%; padding: 0 14mm; color:#888;
                  display:flex; justify-content:space-between; font-family: sans-serif;">
        <span>The Heritage Trail · SPOSA</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  });

  await browser.close();
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`Done. Wrote ${outPath} (${sizeKb} KB)`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
