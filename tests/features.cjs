// Owner's feature switches per role: server withholds data, app hides screens.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
let fails = 0;
function assert(c, m){ if(!c) { fails++; process.exitCode = 1; } console.log((c?'ok: ':'FAIL: ')+m); }
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
async function login(b, id, pw, errs){ const ctx = await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on');
  if(id) await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(2000); return p; }
const Q = '?outlet=rimjhim';
const visible = (p, sel, attr) => p.$$eval(sel, (a, at) => a.filter(x => x.style.display !== 'none').map(x => x.getAttribute(at)), attr);
(async () => {
  const b = await chromium.launch(), errs = [];
  const O = await login(b, '', '1234', errs);
  async function put(p, key, value){ const cur = await call(p, 'GET', '/api/data'+Q); const it = (cur.json.items||{})[key]; return call(p, 'PUT', '/api/data/'+key+Q, { value, baseRev: it ? it.rev : 0 }); }
  async function keys(p){ return Object.keys((await call(p, 'GET', '/api/data'+Q)).json.items || {}); }
  await put(O, 'sales_v1', [{id:'s1',date:'2026-11-01',amount:100,mode:'Cash'}]);
  await put(O, 'expenses_v1', [{id:'e1',date:'2026-11-01',category:'Other',amount:50,mode:'Cash'}]);
  await put(O, 'investments_v1', [{id:'i1',date:'2026-11-01',amount:1000}]);
  await put(O, 'customers_v1', [{id:'c1',name:'Asha'}]);
  await put(O, 'menu_v1', [{id:'m1',name:'Chai',price:20}]);
  await put(O, 'vendors_v1', [{id:'v1',name:'Raju'}]);
  for(const u of [['mgr-1','manager','rimjhim'],['bill-1','billing','rimjhim'],['chef-1','chef','rimjhim'],['part-1','partner','*']])
    await call(O, 'POST', '/api/users', { login:u[0], outlet:u[2], name:u[0], access:u[1], password:'secret123' });
  // defaults: nothing changes
  let M = await login(b, 'mgr-1', 'secret123', errs);
  assert((await keys(M)).includes('expenses_v1'), 'manager sees expenses by default');
  assert((await call(M, 'GET', '/api/features')).status===403 && (await call(M, 'PUT', '/api/features', {config:{manager:{expenses:true}}})).status===403, 'only the owner can change switches');
  // owner sheet
  await O.click('#outletName'); await O.click('#out_logins'); await O.waitForSelector('#lg_feat');
  await O.click('#lg_feat'); await O.waitForSelector('.ftrow');
  assert(await O.$('.ftsw.on[data-feat="expenses"]') && await O.$('.ftrow.locked .ftlock'), 'manager tab: expenses on, money locked 🔒');
  await O.click('[data-feat="expenses"]'); await O.click('[data-feat="customers"]');
  await O.click('[data-frole="chef"]'); await O.click('[data-feat="billing"]');  // extra for chef
  await O.click('[data-frole="partner"]'); await O.click('[data-feat="money"]'); await O.click('[data-feat="backup"]');
  await O.click('[data-frole="billing"]'); await O.click('[data-feat="kitchen"]');
  await O.screenshot({ path: process.env.S+'/features.png' });
  await O.click('#ft_s'); await O.waitForTimeout(800);
  const cfg = (await call(O, 'GET', '/api/features')).json.config; console.log('   '+JSON.stringify(cfg));
  assert(cfg.manager.expenses===false && cfg.manager.customers===false && cfg.chef.billing===true && cfg.partner.money===false && cfg.billing.kitchen===false, 'switches saved');
  assert((await call(O, 'PUT', '/api/features', {config:{manager:{money:true}}})).json.config.manager===undefined, 'money cannot be given to a manager');
  await call(O, 'PUT', '/api/features', {config:cfg});
  // manager: expenses gone from server and screen; customers screen hidden but billing still works
  M = await login(b, 'mgr-1', 'secret123', errs);
  const mk = await keys(M);
  assert(!mk.includes('expenses_v1'), 'manager no longer receives expenses');
  assert(mk.includes('customers_v1'), 'customer list still sent (Billing needs it for udhaar)');
  assert((await put(M, 'expenses_v1', [{id:'x',amount:1}])).status===403, 'manager cannot save expenses');
  const mrec = await visible(M, '#recCtl button', 'data-r');
  assert(!mrec.includes('expenses') && !mrec.includes('fixed') && !mrec.includes('customers') && mrec.includes('sales'), 'manager Records tabs: '+mrec.join());
  // chef gets billing as an extra
  const C = await login(b, 'chef-1', 'secret123', errs);
  const cnav = await visible(C, 'nav.tabs button', 'data-v');
  assert(cnav.includes('counter'), 'chef now has the Counter: '+cnav.join());
  assert((await keys(C)).includes('sales_v1') && (await put(C, 'sales_v1', [{id:'cs',date:new Date(Date.now()+330*60000).toISOString().slice(0,10),amount:20,mode:'Cash'}])).status===200, 'chef can bill (billing rules)');
  // billing without kitchen
  const B = await login(b, 'bill-1', 'secret123', errs);
  const bnav = await visible(B, 'nav.tabs button', 'data-v');
  assert(!bnav.includes('kitchen') && bnav.includes('counter'), 'billing: no Kitchen tab: '+bnav.join());
  // partner without money / backup
  const P = await login(b, 'part-1', 'secret123', errs);
  const pk = await keys(P);
  assert(!pk.includes('investments_v1') && pk.includes('sales_v1') && pk.includes('expenses_v1'), 'partner: no partner money, rest still there');
  const prec = await visible(P, '#recCtl button', 'data-r');
  assert(!prec.includes('investments') && !prec.includes('loans') && prec.includes('expenses'), 'partner Records tabs: '+prec.join());
  assert(await P.$eval('#backupBtn', e => e.style.display==='none'), 'partner: backup button hidden');
  assert((await call(P, 'GET', '/api/export'+Q)).status===403, 'partner: export blocked on the server');
  assert((await put(P, 'investments_v1', [])).status===403, 'partner cannot overwrite investments');
  // owner still sees everything
  assert((await keys(O)).includes('investments_v1') && (await keys(O)).includes('expenses_v1'), 'owner unaffected');
  // reset
  await O.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  await O.waitForSelector('#lg_feat'); await O.click('#lg_feat'); await O.waitForSelector('.ftrow'); await O.click('#ft_reset'); await O.click('#ft_s'); await O.waitForTimeout(800);
  assert(!(await call(O, 'GET', '/api/features')).json.config.manager, 'usual set restores manager');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
