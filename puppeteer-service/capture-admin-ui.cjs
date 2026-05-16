// One-off helper: capture screenshots of the Fraylon admin UI at common viewports.
// Public pages (/login) capture out of the box; /admin* require a valid admin
// session. Pass an ADMIN_EMAIL and ADMIN_PASSWORD env var to attempt sign-in.
//
// Usage:
//   node capture-admin-ui.cjs http://localhost:3000 ./out
//   ADMIN_EMAIL=x ADMIN_PASSWORD=y node capture-admin-ui.cjs http://localhost:3000 ./out
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.resolve(process.argv[3] || './out');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile-375',  width: 375,  height: 812,  deviceScaleFactor: 2 },
  { name: 'desktop-1280', width: 1280, height: 900, deviceScaleFactor: 1 },
];

async function fullPage(page, file) {
  await page.screenshot({ path: file, fullPage: true });
  console.log('saved', file);
}

async function trySignIn(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  await page.type('input[type=email]', email, { delay: 20 });
  await page.type('input[type=password]', password, { delay: 20 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
    page.click('button[type=submit]'),
  ]);
  // Confirm we landed on /admin.
  return page.url().includes('/admin');
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const tryAdmin = Boolean(email && password);

  for (const v of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor });

    // /login (public) — always
    await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    await fullPage(page, path.join(OUT, `login_${v.name}.png`));

    if (tryAdmin) {
      const ok = await trySignIn(page, email, password);
      if (!ok) {
        console.warn(`[${v.name}] sign-in failed; admin pages skipped`);
      } else {
        await page.goto(BASE + '/admin', { waitUntil: 'networkidle0' });
        await fullPage(page, path.join(OUT, `admin_${v.name}.png`));
        await page.goto(BASE + '/admin/issue', { waitUntil: 'networkidle0' });
        await fullPage(page, path.join(OUT, `admin-issue_${v.name}.png`));
      }
    }

    await page.close();
  }

  await browser.close();
})();
