const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  let served = HTML.replace('var APP_BUILD = "dev";', 'var APP_BUILD = "v1";'), live = 'v1';
  await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: served }));
  await p.route('**/build.json*', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ build: live }) }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  await p.click('#refreshBtn'); await p.waitForTimeout(1500);
  assert(await E(p, 'APP_BUILD') === 'v1' && /Refreshed/.test(await p.textContent('#saveStatus')), 'same version: refresh just reloads data');
  // a new version is deployed
  live = 'v2'; served = HTML.replace('var APP_BUILD = "dev";', 'var APP_BUILD = "v2";');
  await E(p, 'window.__marker = 1');
  await p.click('#refreshBtn'); await p.waitForTimeout(3000);
  const marker = await p.evaluate(() => window.__marker);
  assert(marker === undefined, 'newer version: refresh reloaded the app');
  assert(await p.evaluate(() => typeof window.__ev === 'function') && await E(p, 'APP_BUILD') === 'v2', 'now running the new version');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  let served = HTML.replace('var APP_BUILD = "dev";', 'var APP_BUILD = "v1";'), live = 'v1';
  await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: served }));
  await p.route('**/build.json*', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ build: live }) }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  live = 'v2'; served = HTML.replace('var APP_BUILD = "dev";', 'var APP_BUILD = "v2";');
  // form open: no reload
  await E(p, 'window.__m = 1; openForm("expense", null, fmtDate(new Date()))');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, get:()=>false }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(1500);
  assert(await p.evaluate(() => window.__m) === 1, 'no reload while a form is open');
  await E(p, 'closeForm()');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(3000);
  assert(await p.evaluate(() => window.__m) === undefined && await E(p, 'APP_BUILD') === 'v2', 'back in the app: new version loaded automatically');
  await b.close();
})();
