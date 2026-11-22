const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
const call = (p, m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await fetch(path, { method:m, headers: body?{'Content-Type':'application/json'}:{}, body: body?JSON.stringify(body):undefined }); return { status:r.status }; }, [m, path, body]);
(async () => {
  const b = await chromium.launch(); const errs = []; const O = await open(b, errs);
  await E(O, `saveOutlets(function(l){ return l.concat([{id:'o-st',name:'Station'}]); })`);
  await call(O, 'POST', '/api/users', { login:'st-mgr', outlet:'o-st', name:'Ravi', password:'station123' });
  const P = await (await b.newContext({ viewport:{width:400,height:850} })).newPage(); P.on('pageerror', e => errs.push(e.message));
  await P.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await P.goto('http://127.0.0.1:8787/'); await P.waitForSelector('#loginBg.on');
  await P.fill('#loginId','st-mgr'); await P.fill('#loginPin','station123'); await P.click('#loginGo'); await P.waitForTimeout(2500);
  // hold the next sync request until after the password has changed
  let release; const gate = new Promise(r => release = r);
  await P.route('**/api/data?outlet=o-st&since=*', async r => { await gate; r.continue(); });
  await E(P, 'pollRemote()');
  await E(P, 'openOutletSheet()'); await P.click('#sa_pw');
  await P.fill('#pw_old','station123'); await P.fill('#pw_new','newpass99'); await P.fill('#pw_new2','newpass99'); await P.click('#pw_save'); await P.waitForTimeout(800);
  release(); await P.waitForTimeout(1500);
  assert(!(await P.evaluate(() => document.getElementById('loginBg').classList.contains('on'))), 'no login screen after changing the password, even with a sync in flight');
  await P.unroute('**/api/data?outlet=o-st&since=*');
  assert((await call(P, 'GET', '/api/data?outlet=o-st')).status === 200, 'still signed in with the new password');
  // a genuinely signed-out phone still gets the login screen
  await call(O, 'DELETE', '/api/users/st-mgr');
  await E(P, 'pollRemote()'); await P.waitForTimeout(1500);
  assert(await P.evaluate(() => document.getElementById('loginBg').classList.contains('on')), 'deleted login still sees the sign-in screen');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
