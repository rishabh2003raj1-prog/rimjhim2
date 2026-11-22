const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  await p.evaluate(() => { setTimeout(function(){ throw new Error("test boom in counter"); }, 0); });
  await p.waitForTimeout(1500);
  const r = await call(p, 'GET', '/api/clienterrors');
  assert(r.status===200 && r.json.errors.some(e => /test boom in counter/.test(e.msg) && e.who==='owner'), 'error on the phone reached the server: '+JSON.stringify((r.json.errors||[]).slice(0,1)));
  await E(p, 'openActivitySheet()'); await p.waitForSelector('#ac_errs'); await p.click('#ac_errs'); await p.waitForTimeout(800);
  assert(/test boom in counter/.test(await p.textContent('#ac_errlist')), 'shown in Activity → App errors');
  const anon = await (await b.newContext()).newPage(); await anon.goto('http://127.0.0.1:8787/privacy.html');
  assert(/Digital Personal Data Protection Act, 2023/.test(await anon.textContent('body')), 'privacy policy page');
  await anon.goto('http://127.0.0.1:8787/terms.html'); assert(/illustrative purposes only/.test(await anon.textContent('body')), 'terms page');
  const a1 = await call(anon, 'POST', '/api/clienterror', { msg:'spam' }); assert(a1.status===401, 'strangers cannot post errors');
  await anon.goto('http://127.0.0.1:8787/'); assert(await anon.$('a[href="privacy.html"]'), 'sign-in screen links the privacy policy');
  await anon.goto('http://127.0.0.1:8787/c'); assert(await anon.$('a[href="terms.html"]'), 'customer page links the terms');
  const mf = await call(anon, 'GET', '/manifest.webmanifest'); assert(mf.json && /management/.test(mf.json.description), 'manifest has a description');
  console.log('ERRORS', JSON.stringify(errs.filter(e => !/test boom/.test(e)))); await b.close();
})();
