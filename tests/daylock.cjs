const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
const crypto = require('crypto'), http = require('http');
const call = (p, m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await fetch(path, { method:m, headers: body?{'Content-Type':'application/json'}:{}, body: body?JSON.stringify(body):undefined }); return { status:r.status, data: await r.json().catch(()=>null) }; }, [m, path, body]);
const loginShown = (p) => p.evaluate(() => document.getElementById('loginBg').classList.contains('on'));
async function signIn(p, id, pw){ await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(1800); }
function raw(method, path, body, cookie){ return new Promise(res => { const rq = http.request({ host:'127.0.0.1', port:8787, path, method, headers:Object.assign({'Content-Type':'application/json'}, cookie?{Cookie:cookie}:{}) }, r => { let d=''; r.on('data', c=>d+=c); r.on('end', ()=>res({ status:r.statusCode, headers:r.headers, body:d })); }); rq.end(body?JSON.stringify(body):undefined); }); }
(async () => {
  const b = await chromium.launch(); const errs = [];
  // cookie lifetime: until the next 4 AM India time
  const L = await raw('POST', '/api/login', { login:'', password:'1234' });
  const ck = L.headers['set-cookie'][0], exp = JSON.parse(L.body).exp, maxAge = +/Max-Age=(\d+)/.exec(ck)[1];
  const ist = new Date(exp + 330*60000);
  console.log('   expires', new Date(exp).toISOString(), '(IST', ist.toISOString().slice(11,16)+')', 'max-age', maxAge);
  assert(ist.getUTCHours() === 4 && ist.getUTCMinutes() === 0 && maxAge >= 7200 && maxAge <= 26*3600, 'sign-in lasts until 4 AM India time');
  const tok = /rj_session=([^;]+)/.exec(ck)[1];
  assert((await raw('GET', '/api/session', null, 'rj_session='+tok)).status === 200, 'token works');
  // tampered / expired tokens are refused
  const parts = tok.split('.');
  const later = ['o', String(+parts[1] + 86400000*30), parts[2], parts[3]].join('.');
  assert((await raw('GET', '/api/session', null, 'rj_session='+later)).status === 401, 'changed expiry refused (signature)');
  const pastExp = Date.now() - 1000, sig = crypto.createHmac('sha256', '1234').update('rimjhim-owner-v2|'+pastExp+'|'+parts[2]).digest('hex');
  assert((await raw('GET', '/api/session', null, 'rj_session=o.'+pastExp+'.'+parts[2]+'.'+sig)).status === 401, 'expired token refused');
  const oldStyle = crypto.createHmac('sha256', '1234').update('rimjhim-session-v1').digest('hex');
  assert((await raw('GET', '/api/session', null, 'rj_session='+oldStyle)).status === 401, 'old never-expiring token refused');

  const O = await open(b, errs);
  await E(O, `saveOutlets(function(l){ return l.concat([{id:'o-station',name:'Rimjhim - Station Road'}]); })`);
  await call(O, 'POST', '/api/users', { login:'station-road', outlet:'o-station', name:'Ravi', password:'station123' });
  // reopen: no prompt
  await O.reload(); await O.waitForTimeout(1800);
  assert(!(await loginShown(O)), 'reopening the same day does not ask');
  // long time in the background: no prompt
  await O.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, get:()=>true }); document.dispatchEvent(new Event('visibilitychange')); });
  await O.waitForTimeout(400);
  await O.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, get:()=>false }); document.dispatchEvent(new Event('visibilitychange')); });
  await O.waitForTimeout(800);
  assert(!(await loginShown(O)), 'coming back from the background does not ask');
  // store phone signs in once (one prompt, even when switching store)
  const P = await (await b.newContext({ viewport:{width:400,height:850} })).newPage(); P.on('pageerror', e => errs.push(e.message));
  await P.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await P.goto('http://127.0.0.1:8787/'); await P.waitForSelector('#loginBg.on');
  await signIn(P, 'station-road', 'station123'); await P.waitForTimeout(1500);
  assert(!(await loginShown(P)) && await E(P, 'OUTLET.id') === 'o-station', 'store login: one prompt, opens its store');
  await P.reload(); await P.waitForTimeout(1800);
  assert(!(await loginShown(P)), 'store phone reopen: no prompt');
  // after 4 AM (simulated): asks again on return
  await E(P, `localStorage.setItem('session_exp_v1', String(Date.now()-1000))`);
  await P.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, get:()=>false }); document.dispatchEvent(new Event('visibilitychange')); });
  await P.waitForTimeout(1200);
  assert(await loginShown(P) && await P.inputValue('#loginId') === 'station-road', 'after 4 AM: asks again, ID filled in');
  await signIn(P, 'station-road', 'station123'); await P.waitForTimeout(800);
  assert(!(await loginShown(P)), 'signed in for the new day');
  // store login can't sign everyone out
  assert((await call(P, 'POST', '/api/logout-all')).status === 403, 'store login cannot sign everyone out');
  // owner: sign out all phones
  await E(O, 'openOutletSheet()'); await O.waitForTimeout(300);
  await O.click('#out_logoutall'); await O.click('#dlgBtns .dlgyes'); await O.waitForTimeout(2500);
  assert(await loginShown(O), 'owner phone asks after "sign out all"');
  assert((await call(P, 'GET', '/api/data?outlet=o-station')).status === 401, 'store phone signed out by "sign out all"');
  await E(P, 'pollRemote()'); await P.waitForTimeout(800);
  assert(await loginShown(P), 'store phone shows the sign-in');
  await signIn(P, 'station-road', 'station123');
  assert(!(await loginShown(P)), 'store can sign in again after "sign out all"');
  await signIn(O, '', '1234');
  assert(!(await loginShown(O)), 'owner signs in again');
  // offline with the day expired: only the last login can open
  await E(P, `localStorage.setItem('session_exp_v1', String(Date.now()-1000))`);
  await P.route('**/api/**', r => r.abort());
  await P.reload(); await P.waitForTimeout(1500);
  assert(await loginShown(P), 'offline after expiry: asks');
  await signIn(P, '', '1234');
  assert(await loginShown(P), 'offline: another login cannot open');
  await signIn(P, 'station-road', 'station123');
  assert(!(await loginShown(P)) && await E(P, 'OUTLET.id') === 'o-station', 'offline: last login opens');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
