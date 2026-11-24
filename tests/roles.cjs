const { chromium } = require('playwright');
let fails = 0;
function assert(c, m){ if(!c) fails++; console.log((c?'ok: ':'FAIL: ')+m); }
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
async function login(b, id, pw){ const ctx = await b.newContext({ viewport:{width:400,height:850} }); const p = await ctx.newPage(); await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on');
  if(id) await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(2000); return p; }
const Q = '?outlet=rimjhim';
const today = new Date(Date.now()+330*60000).toISOString().slice(0,10);
(async () => {
  const b = await chromium.launch();
  const O = await login(b, '', '1234');
  async function put(p, key, value){ const cur = await call(p, 'GET', '/api/data'+Q); const it = (cur.json.items||{})[key]; return call(p, 'PUT', '/api/data/'+key+Q, { value, baseRev: it ? it.rev : 0 }); }
  async function data(p){ return (await call(p, 'GET', '/api/data'+Q)).json.items || {}; }
  // Owner's books
  await put(O, 'sales_v1', [{id:'old',date:'2026-01-05',customer:'Walk-in',amount:500,mode:'Cash'},{id:'tod',date:today,customer:'Walk-in',amount:300,mode:'Cash'}]);
  await put(O, 'investments_v1', [{id:'i1',date:'2026-10-01',partner:'Rishabh',invType:'Investment',amount:100000}]);
  await put(O, 'loans_v1', [{id:'l1',date:'2026-10-01',type:'take',party:'Uncle',amount:50000}]);
  await put(O, 'payroll_v1', [{id:'pr1',staffId:'s1',month:'2026-10',settled:true}]);
  await put(O, 'staff_v1', [{id:'s1',name:'Ravi',role:'Cook',salary:15000,houseRent:2000,upi:'ravi@upi',defaultShift:'Morning',status:'Active'}]);
  await put(O, 'expenses_v1', [{id:'e1',date:'2026-10-05',category:'Staff Salary',description:'Ravi - October 2026 salary',staffId:'s1',amount:15000,mode:'Cash'},{id:'e2',date:'2026-10-06',category:'Other',description:'Gas',amount:900,mode:'Cash'}]);
  await put(O, 'settings_v1', { bankBalance:250000, bankDate:'2026-10-01', shifts:[{name:'Morning',time:'8-4'}], defaultFloat:2000 });
  await put(O, 'cashmoves_v1', [{id:'m1',type:'bankcheck',date:'2026-10-02',amount:250000},{id:'m2',type:'counter',date:'2026-10-02',amount:500},{id:'m3',type:'withdraw',holder:'Rishabh',date:'2026-10-03',amount:5000}]);
  await put(O, 'menu_v1', [{id:'mn1',name:'Chai',price:20}]);
  await put(O, 'notes_v1', [{id:'n1',text:'Rishabh invested 100000',status:'processed'}]);
  for(const u of [['ravi-mgr','manager','rimjhim'],['chef-1','chef','rimjhim'],['bill-1','billing','rimjhim'],['part-1','partner','*']])
    assert((await call(O, 'POST', '/api/users', { login:u[0], outlet:u[2], name:u[0], access:u[1], password:'secret123' })).status===200, 'created '+u[1]+' login');
  assert((await call(O, 'POST', '/api/users', { login:'bad-1', outlet:'*', name:'x', access:'manager', password:'secret123' })).status===400, 'only partners can be for all stores');

  const M = await login(b, 'ravi-mgr', 'secret123'), C = await login(b, 'chef-1', 'secret123'), B = await login(b, 'bill-1', 'secret123'), P = await login(b, 'part-1', 'secret123');
  const sess = await call(M, 'GET', '/api/session');
  // daily checks: chef and billing add, can't touch others'; manager sees all
  await put(M, 'checks_v1', [{id:'k0',kind:'list',listId:'open',date:'2026-01-02',time:'09:00',items:[]}]);
  let ck = await put(B, 'checks_v1', [{id:'k1',kind:'list',listId:'open',date:today,time:'09:10',items:[{t:'Gas',ok:true}]}]);
  assert(ck.status===200, 'billing files an opening check');
  ck = await put(C, 'checks_v1', [{id:'k2',kind:'asset',assetId:'fr',status:'broken',date:today,time:'09:20'}]);
  assert(ck.status===200, 'chef files an asset check');
  const allChecks = (await data(M)).checks_v1.value.map(x=>x.id).sort().join();
  assert(allChecks==='k0,k1,k2', 'manager sees every check, none lost: '+allChecks);
  const billSees = (await data(B)).checks_v1.value.map(x=>x.id).sort().join();
  assert(!/k0/.test(billSees), 'billing does not see old checks: '+billSees);
  assert(sess.json.access==='manager' && sess.json.perms.sales_v1==='rw' && !sess.json.perms.investments_v1, 'session tells the app the role and lists');

  // ---- what each role can read ----
  let d = await data(M);
  assert(!d.investments_v1 && !d.loans_v1 && !d.payroll_v1, 'manager: no partner money, loans or salary settlements');
  assert(d.staff_v1.value[0].name==='Ravi' && d.staff_v1.value[0].salary===undefined && d.staff_v1.value[0].upi===undefined, 'manager: staff without pay details');
  const e1 = d.expenses_v1.value.find(x=>x.id==='e1');
  assert(e1.description==='Staff payment' && !e1.staffId && e1.redacted, 'manager: salary payments redacted (no name), gas visible: '+JSON.stringify(e1));
  assert(d.settings_v1.value.bankBalance===undefined && d.settings_v1.value.defaultFloat===2000, 'manager: settings without bank balance');
  assert(d.cashmoves_v1.value.map(x=>x.id).join()==='m2', 'manager: only counter cash moves (no bank check, no partner withdrawal)');
  assert(d.notes_v1 && d.notes_v1.value.length===0, 'manager: does not see the owner’s notes');
  d = await data(C);
  assert(!d.sales_v1 && !d.expenses_v1 && !d.cashmoves_v1, 'chef: no sales, expenses or cash');
  assert(JSON.stringify(Object.keys(d.staff_v1.value[0]).sort())===JSON.stringify(['defaultShift','id','name','role','status']), 'chef: staff names / roles / shifts only');
  assert(d.settings_v1.value.shifts && d.settings_v1.value.bankBalance===undefined, 'chef: only public settings');
  assert(d.menu_v1.value[0].name==='Chai', 'chef: sees the menu');
  d = await data(B);
  assert(d.sales_v1.value.map(x=>x.id).join()==='tod', 'billing: only the last two days of sales');
  assert(!d.purchases_v1 && !d.expenses_v1 && !d.investments_v1, 'billing: no purchases, expenses or partner money');
  d = await data(P);
  assert(d.investments_v1 && d.loans_v1 && d.payroll_v1 && d.staff_v1.value[0].salary===15000, 'partner: everything');
  assert((await call(P, 'GET', '/api/data?outlet=_global')).status===200, 'partner (all stores) can read the store list');

  // ---- what each role can change ----
  assert((await put(M, 'investments_v1', [])).status===403, 'manager cannot write partner money');
  assert((await put(C, 'sales_v1', [])).status===403, 'chef cannot write sales');
  assert((await put(C, 'staff_v1', [])).status===403, 'chef cannot change staff');
  await put(M, 'expenses_v1', []);
  d = await data(O);
  assert(d.expenses_v1.value.some(x=>x.id==='e1' && x.amount===15000 && x.staffId==='s1'), 'manager emptying expenses keeps salary records intact');
  await put(M, 'staff_v1', [{id:'s1',name:'Ravi Kumar',role:'Cook',salary:1,defaultShift:'Evening',status:'Active'}]);
  d = await data(O);
  assert(d.staff_v1.value[0].name==='Ravi Kumar' && d.staff_v1.value[0].salary===15000 && d.staff_v1.value[0].upi==='ravi@upi', 'manager renames staff; pay stays as the owner set it');
  await put(M, 'settings_v1', { bankBalance:0, shifts:[{name:'Morning',time:'7-3'}], defaultFloat:1500 });
  d = await data(O);
  assert(d.settings_v1.value.bankBalance===250000 && d.settings_v1.value.defaultFloat===1500, 'manager settings save keeps the bank balance');
  await put(B, 'sales_v1', []);
  d = await data(O);
  assert(d.sales_v1.value.length===2, 'billing cannot delete sales');
  const bs = (await data(B)).sales_v1.value;
  await put(B, 'sales_v1', bs.map(x => x.id==='tod' ? Object.assign({}, x, {amount:1}) : x).concat([{id:'b1',date:today,customer:'Walk-in',amount:40,mode:'UPI'}]));
  d = await data(O);
  const tod = d.sales_v1.value.find(x=>x.id==='tod'), b1 = d.sales_v1.value.find(x=>x.id==='b1');
  assert(tod.amount===300 && b1 && b1.by==='bill-1', 'billing adds a sale (marked bill-1) but cannot change someone else’s');
  const bs2 = (await data(B)).sales_v1.value;
  await put(B, 'sales_v1', bs2.map(x => x.id==='b1' ? Object.assign({}, x, {amount:60}) : x));
  d = await data(O);
  assert(d.sales_v1.value.find(x=>x.id==='b1').amount===60, 'billing can correct its own sale');
  const cf = await call(B, 'PUT', '/api/data/sales_v1'+Q, { value:[], baseRev:0 });
  assert(cf.status===409 && cf.json.value.every(x=>x.id!=='old'), 'a conflict reply still hides old sales from billing');

  // ---- other routes ----
  assert((await call(B, 'GET', '/api/export'+Q)).status===403 && (await call(M, 'GET', '/api/export'+Q)).status===403, 'only full access can export');
  assert((await call(M, 'GET', '/api/audit'+Q)).status===403 && (await call(B, 'GET', '/api/audit'+Q)).status===403, 'staff cannot see the activity log');
  const au = await call(P, 'GET', '/api/audit'+Q);
  assert(au.status===200 && au.json.entries.some(e=>e.who==='bill-1' && e.key==='sales_v1' && e.added===1), 'partner sees in the activity log that bill-1 added a sale');
  assert((await call(M, 'GET', '/api/backups'+Q)).status===403, 'manager cannot open backups');
  const bk = await call(O, 'POST', '/api/backups'+Q);
  assert(bk.status===200 && bk.json.backups.length===1, 'owner can back up now');
  const dl = await O.evaluate(async (u) => { const r = await fetch(u); return [r.status, (await r.text()).slice(0,60)]; }, '/api/backups/'+bk.json.backups[0].day+Q);
  assert(dl[0]===200 && /"investments_v1"/.test(await O.evaluate(async (u) => (await fetch(u)).text(), '/api/backups/'+bk.json.backups[0].day+Q)), 'backup download has all the data');
  const lg = await O.evaluate(async () => (await fetch('/api/data?outlet=rimjhim', { headers:{'x-api-key':'1234'} })).status);
  // (with a cookie this is just a normal read; the old PIN route is checked without a cookie below)
  const ctx = await b.newContext(); const anon = await ctx.newPage(); await anon.goto('http://127.0.0.1:8787/');
  const legacy = await anon.evaluate(async () => (await fetch('/api/data?outlet=rimjhim', { headers:{'x-api-key':'1234'} })).status);
  assert(legacy===401, 'old PIN-header route is off (got '+legacy+')');
  // role change signs the login out
  await call(O, 'POST', '/api/users', { login:'bill-1', outlet:'rimjhim', name:'bill-1', access:'chef', password:null });
  assert((await call(B, 'GET', '/api/session')).status===401, 'changing a role signs that login out');

  // ---- screens follow the role ----
  await C.reload(); await C.waitForTimeout(2500);
  const nav = await C.evaluate(() => Array.from(document.querySelectorAll('nav.tabs button')).filter(x=>x.style.display!=='none').map(x=>x.getAttribute('data-v')).join());
  const rec = await C.evaluate(() => Array.from(document.querySelectorAll('#recCtl button')).filter(x=>x.style.display!=='none').map(x=>x.getAttribute('data-r')).join());
  assert(nav==='kitchen,notes,staff,records' && rec.split(',').sort().join()==='assets,menu,orders,purchases,stock,vendors,zones', 'chef sees only kitchen screens: '+nav+' | '+rec);
  assert(/Chef/.test(await C.textContent('#roleTag')), 'role shown in the header');
  const Mrec = await M.evaluate(() => Array.from(document.querySelectorAll('#recCtl button')).filter(x=>x.style.display!=='none').map(x=>x.getAttribute('data-r')).join());
  assert(!/investments|loans|bank|partners|review/.test(Mrec) && /sales/.test(Mrec), 'manager has no partner / loans / bank screens: '+Mrec);
  const Mstaff = await M.evaluate(() => Array.from(document.querySelectorAll('#staffCtl button')).filter(x=>x.style.display!=='none').map(x=>x.getAttribute('data-s')).join());
  assert(!/salary/.test(Mstaff), 'manager has no Salary tab');
  // a phone used by the owner, then by a staff login: the owner's offline copy is cleared
  await O.evaluate(() => { localStorage.setItem('last_login_id_v1',''); });
  await O.evaluate(() => fetch('/api/logout', { method:'POST' }));
  await O.reload(); await O.waitForSelector('#loginBg.on'); await O.fill('#loginId','ravi-mgr'); await O.fill('#loginPin','secret123'); await O.click('#loginGo'); await O.waitForTimeout(3500);
  // The phone clears the old copy and reloads; wait for that rather than a fixed time.
  let leftovers = -1;
  for (let i = 0; i < 24; i++) { leftovers = await O.evaluate(() => Object.keys(localStorage).filter(k => /investments_v1|loans_v1|payroll_v1/.test(k)).length).catch(() => -1); if (leftovers === 0) break; await O.waitForTimeout(500); }
  assert(leftovers===0, 'owner’s partner money / loans are not left on the phone for the manager');
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
