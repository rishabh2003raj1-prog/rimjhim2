// Opening the app on a staff phone: before the server says who is signed in, the screens follow the last
// login seen on the phone — never the owner's screens.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
const call = (pg, m, u, bd) => pg.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status }; }, [m, u, bd]);
const visibleTabs = (p) => p.$$eval('nav.tabs button', a => a.filter(x => x.offsetParent !== null && getComputedStyle(x).display !== 'none').map(x => x.getAttribute('data-v')));
(async () => {
  const b = await chromium.launch(), errs = [];
  const O = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  await O.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await O.goto('http://127.0.0.1:8787/'); await O.waitForSelector('#loginBg.on'); await O.fill('#loginPin','1234'); await O.click('#loginGo'); await O.waitForTimeout(1500);
  assert((await call(O, 'POST', '/api/users', { login:'counter-2', outlet:'rimjhim', name:'Counter', access:'billing', password:'secret123' })).status===200, 'billing login made');
  const ctx = await b.newContext({ viewport:{width:400,height:850} }), B = await ctx.newPage();
  B.on('pageerror', e => errs.push(e.message));
  let delay = 0;
  await B.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await B.route(u => u.pathname === '/api/session', async r => { if (delay) await new Promise(res => setTimeout(res, delay)); r.continue(); });
  await B.goto('http://127.0.0.1:8787/'); await B.waitForSelector('#loginBg.on'); await B.fill('#loginId', 'counter-2'); await B.fill('#loginPin', 'secret123'); await B.click('#loginGo'); await B.waitForTimeout(2500);
  const after = await visibleTabs(B);
  assert(after.indexOf('dashboard')<0 && after.indexOf('counter')>=0, 'signed in as counter: counter screens, no dashboard: '+after.join(','));
  // Reopen the app with a slow answer from the server
  delay = 3000;
  await B.reload(); await B.waitForTimeout(600);
  const early = await visibleTabs(B);
  assert(early.length && early.indexOf('dashboard')<0 && early.indexOf('calendar')<0, 'while the server is slow: still counter screens, never the owner\'s: '+early.join(','));
  assert(!(await B.isVisible('#backupBtn')) && !(await B.isVisible('#reportsBtn')), 'no Backup / Reports buttons while waiting');
  await B.waitForTimeout(3500);
  assert(JSON.stringify(await visibleTabs(B))===JSON.stringify(after), 'after the answer: same screens');
  // Nothing saved yet about the login (e.g. after an update): counter screens with nothing readable, then the real ones
  await B.evaluate(() => localStorage.removeItem('who_cache_v1'));
  await B.reload(); await B.waitForTimeout(600);
  const prov = await visibleTabs(B);
  assert(prov.indexOf('dashboard')<0 && prov.indexOf('calendar')<0 && await E(B, 'cloud.who && cloud.who.provisional===true'), 'no saved login: limited screens until the server answers: '+prov.join(','));
  await B.waitForTimeout(3500);
  assert(JSON.stringify(await visibleTabs(B))===JSON.stringify(after) && await E(B, '!cloud.who.provisional'), 'then the real counter screens');
  // Owner phone still opens with everything
  await O.reload(); await O.waitForTimeout(1500);
  assert((await visibleTabs(O)).indexOf('dashboard')>=0, 'owner phone: all screens');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
