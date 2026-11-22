const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
async function openAs(b, errs, id, pw){
  const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on');
  await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(2000); return p; }
const call = (p, m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await fetch(path, { method:m, headers: body?{'Content-Type':'application/json'}:{}, body: body?JSON.stringify(body):undefined }); return { status:r.status, data: await r.json().catch(()=>null) }; }, [m, path, body]);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const O = await open(b, errs);   // owner (blank ID + PIN)
  // owner sets up two stores with data
  await E(O, `sales=[{id:'m1',date:fmtDate(new Date()),customer:'Main',amount:111,mode:'Cash'}]; saveSales();`);
  await E(O, `saveOutlets(function(l){ return l.concat([{id:'o-station',name:'Rimjhim - Station Road'}]); })`);
  await O.waitForTimeout(800);
  await call(O, 'PUT', '/api/data/sales_v1?outlet=o-station', { value:[{id:'st1',date:'2026-11-07',customer:'Station',amount:222,mode:'Cash'}], baseRev:0 });
  // create logins from the UI
  await E(O, 'openOutletSheet()'); await O.waitForTimeout(400);
  await O.click('#out_logins'); await O.waitForSelector('[data-lgadd="o-station"]');
  await O.click('[data-lgadd="o-station"]'); await O.fill('#lf_id', 'Station-Road'); await O.fill('#lf_name', 'Manager Ravi'); await O.fill('#lf_pw', '123');
  await O.click('#lf_save'); await O.waitForTimeout(300);
  assert(/at least 6/.test(await O.textContent('#lf_err')), 'short password refused');
  await O.fill('#lf_pw', 'station123'); await O.click('#lf_save'); await O.waitForTimeout(800);
  console.log('   ' + (await O.textContent('#dlgMsg')).replace(/\n/g,' | ')); await O.click('#dlgBtns button');
  const list = await call(O, 'GET', '/api/users');
  assert(list.status === 200 && list.data.users.length === 1 && list.data.users[0].login === 'station-road' && list.data.users[0].outlet === 'o-station' && !('hash' in list.data.users[0]), 'login saved (lowercased), no hash exposed');
  await call(O, 'POST', '/api/users', { login:'main-desk', outlet:'rimjhim', name:'Main counter', password:'main12345' });
  // wrong password
  const X = await (await b.newContext()).newPage(); X.on('pageerror', e => errs.push(e.message));
  await X.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await X.goto('http://127.0.0.1:8787/'); await X.waitForSelector('#loginBg.on');
  await X.fill('#loginId','station-road'); await X.fill('#loginPin','wrong-pass'); await X.click('#loginGo'); await X.waitForTimeout(800);
  assert(/Wrong login ID or password/.test(await X.textContent('#loginErr')), 'wrong password refused');
  // store login opens its own store
  const ST = await openAs(b, errs, 'station-road', 'station123');
  await ST.waitForTimeout(1500);
  assert(await E(ST, 'OUTLET.id') === 'o-station' && /Station Road/.test(await ST.textContent('#outletName')), 'store login opens Station Road automatically');
  assert(await E(ST, 'sales.length') === 1 && await E(ST, 'sales[0].customer') === 'Station', 'sees only Station Road sales');
  // server refuses other stores, outlet list and logins
  assert((await call(ST, 'GET', '/api/data?outlet=rimjhim')).status === 403, 'cannot read main store data');
  assert((await call(ST, 'PUT', '/api/data/sales_v1?outlet=rimjhim', { value:[], baseRev:1 })).status === 403, 'cannot write main store data');
  assert((await call(ST, 'GET', '/api/data?outlet=_global')).status === 403, 'cannot read the outlet list');
  assert((await call(ST, 'GET', '/api/users')).status === 403 && (await call(ST, 'POST', '/api/users', {login:'hack',outlet:'rimjhim',password:'xxxxxxx'})).status === 403, 'cannot manage logins');
  assert((await call(ST, 'GET', '/api/export?outlet=rimjhim')).status === 403, 'cannot export main store');
  // store sheet shows only its account
  await E(ST, 'openOutletSheet()'); await ST.waitForTimeout(300);
  const sheet = await ST.textContent('#sheet');
  assert(/Manager Ravi/.test(sheet) && !/Add outlet/.test(sheet) && !/Rimjhim Cafe\b(?! -)/.test(sheet.replace('Rimjhim - Station Road','')), 'store sheet: own account only, no other stores');
  await E(ST, 'closeForm()');
  // writes from the store login reach its store
  await E(ST, `sales.push({id:'st2',date:fmtDate(new Date()),customer:'Walk-in',amount:50,mode:'Cash'}); saveSales();`);
  await ST.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  assert((await call(O, 'GET', '/api/data?outlet=o-station')).data.items.sales_v1.value.length === 2, 'store sale saved to its store (owner sees it)');
  // phone switched between stores: a stale outlet setting is corrected
  const MD = await openAs(b, errs, 'main-desk', 'main12345'); await MD.waitForTimeout(1500);
  assert(await E(MD, 'OUTLET.id') === 'rimjhim' && await E(MD, 'sales[0].customer') === 'Main', 'main-desk login opens the main store');
  // password change signs other phones out
  const ST2 = await openAs(b, errs, 'station-road', 'station123'); await ST2.waitForTimeout(1500);
  await E(ST, 'openOutletSheet()'); await ST.click('#sa_pw');
  await ST.fill('#pw_old','station123'); await ST.fill('#pw_new','newpass99'); await ST.fill('#pw_new2','newpass99'); await ST.click('#pw_save'); await ST.waitForTimeout(800);
  assert(/Password changed/.test(await ST.textContent('#dlgMsg')), 'password changed'); await ST.click('#dlgBtns button');
  assert((await call(ST, 'GET', '/api/data?outlet=o-station')).status === 200, 'this phone stays signed in');
  assert((await call(ST2, 'GET', '/api/data?outlet=o-station')).status === 401, 'other phone with old password signed out');
  // owner deletes the login -> signed out
  await call(O, 'DELETE', '/api/users/station-road');
  assert((await call(ST, 'GET', '/api/data?outlet=o-station')).status === 401, 'deleted login is signed out');
  // owner still opens every store
  assert((await call(O, 'GET', '/api/data?outlet=o-station')).status === 200 && (await call(O, 'GET', '/api/data?outlet=rimjhim')).status === 200, 'owner opens every store');
  // sign out clears every store's offline copy
  await E(MD, `localStorage.setItem('o-other__sales_v1','[1]');`);
  await E(MD, 'signOut()'); await MD.click('#dlgBtns .dlgyes'); await MD.waitForTimeout(1500);
  assert(await MD.evaluate(() => { for (let i=0;i<localStorage.length;i++){ if(/sales_v1$/.test(localStorage.key(i))) return false; } return true; }), 'sign out removed all offline store data');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
