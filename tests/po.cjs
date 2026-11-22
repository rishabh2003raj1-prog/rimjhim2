const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function login(b, id, pw, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(id+': '+e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); if(id) await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(2500); return p; }
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
const Q = '?outlet=rimjhim';
async function flush(p){ await E(p, 'scheduleFlush(0)'); await p.waitForFunction(() => window.__ev('Object.keys(cloud.dirty).length===0'), null, { timeout:20000 }); }
async function fresh(p, sub){ await E(p, 'syncNow && syncNow()').catch(()=>{}); await p.reload(); await p.waitForTimeout(2500); await E(p, `showView('records'); switchRecordsSub('${sub||'orders'}');`); }
async function serverPos(p){ const r = await call(p, 'GET', '/api/data'+Q); return ((r.json.items||{}).pos_v1||{}).value || []; }
(async () => {
  const b = await chromium.launch(), errs = [];
  const O = await login(b, '', '1234', errs);
  const dis = (p) => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  for(const u of [['mgr-1','manager'],['chef-1','chef']]) await call(O, 'POST', '/api/users', { login:u[0], outlet:'rimjhim', name:u[0]==='mgr-1'?'Ravi':'Sonu', access:u[1], password:'secret123' });
  await E(O, `settings.poManagerLimit = 1000; ingredients=[{id:'pan',name:'Paneer',unit:'g',type:'Raw material',minStock:0,vendor:'Sharma Dairy',openingStock:0}]; purchases=[{id:'p0',date:'2026-11-01',vendor:'Sharma Dairy',item:'Paneer',qty:1,unit:'kg',rate:300,gst:0,mode:'Cash'}]; saveSettings(); saveIngredients(); savePurch();`);
  await flush(O);
  const M = await login(b, 'mgr-1', 'secret123', errs), C = await login(b, 'chef-1', 'secret123', errs);
  // chef requests 2 kg paneer
  await E(C, `showView('records'); switchRecordsSub('orders');`);
  assert(await C.isVisible('#po_new'), 'chef sees Orders with New request');
  await C.click('#po_new'); await C.fill('[data-pl="0"][data-f="item"]','Paneer'); await C.dispatchEvent('[data-pl="0"][data-f="item"]','change');
  assert(await E(C, `document.getElementById('po_vendor').value`)==='Sharma Dairy' && await E(C, `document.querySelector('[data-pl="0"][data-f="rate"]').value`)==='300', 'vendor and last price filled in from history');
  await C.fill('[data-pl="0"][data-f="qty"]','2'); await C.click('#po_save'); await dis(C); await flush(C);
  let sp = await serverPos(C);
  assert(sp.length===1 && sp[0].status==='requested' && sp[0].by==='chef-1' && sp[0].no===1, 'request saved on server by chef: '+JSON.stringify(sp.map(x=>[x.status,x.by])));
  // chef tries to approve through the API
  let cur = await call(C, 'GET', '/api/data'+Q), it = cur.json.items.pos_v1;
  await call(C, 'PUT', '/api/data/pos_v1'+Q, { value: it.value.map(x=>Object.assign({}, x, { status:'approved', approvedBy:'owner' })), baseRev: it.rev });
  sp = await serverPos(C);
  assert(sp[0].status==='requested' && !sp[0].approvedBy, 'chef cannot approve (server keeps it requested)');
  // manager approves (600 within 1000)
  await fresh(M);
  assert(/Needs your action · 1/.test(await M.textContent('#ordersView')), 'manager sees it under Needs your action');
  await M.click('[data-po]'); await M.click('#pd_ok'); await flush(M);
  sp = await serverPos(M);
  assert(sp[0].status==='approved' && sp[0].approvedBy==='mgr-1' && sp[0].approvedRole==='manager', 'manager approved, server stamped mgr-1');
  // chef asks for 5 kg (1500 > limit)
  await fresh(C); await C.click('#po_new'); await C.fill('[data-pl="0"][data-f="item"]','Paneer'); await C.dispatchEvent('[data-pl="0"][data-f="item"]','change');
  await C.fill('[data-pl="0"][data-f="qty"]','5'); await C.click('#po_save'); await dis(C); await flush(C);
  await fresh(M);
  const big = (await serverPos(M)).find(x=>x.no===2);
  await M.click(`[data-po="${big.id}"]`);
  assert(!(await M.$('#pd_ok')) && await M.$('#pd_up') && /above your/.test(await M.textContent('#sheet')), 'over the limit: manager can only send it to the owner');
  cur = await call(M, 'GET', '/api/data'+Q); it = cur.json.items.pos_v1;
  const r403 = await call(M, 'PUT', '/api/data/pos_v1'+Q, { value: it.value.map(x=>x.id===big.id ? Object.assign({}, x, { status:'approved' }) : x), baseRev: it.rev });
  assert(r403.status===403 && /limit/.test(r403.json.error), 'server refuses manager approving above the limit');
  await M.click('#pd_up'); await flush(M);
  // manager cannot raise own limit
  cur = await call(M, 'GET', '/api/data'+Q); it = cur.json.items.settings_v1;
  await call(M, 'PUT', '/api/data/settings_v1'+Q, { value: Object.assign({}, it.value, { poManagerLimit: 99999 }), baseRev: it.rev });
  cur = await call(O, 'GET', '/api/data'+Q);
  assert(cur.json.items.settings_v1.value.poManagerLimit===1000, 'manager cannot change the approval limit');
  // owner approves the big one
  await fresh(O);
  assert(/waiting for your approval/.test(await E(O, `attentionItems().map(function(x){return x.t;}).join('|')`)), 'owner gets a needs-attention line');
  await O.click(`#ordersView [data-po="${big.id}"]`); await O.click('#pd_ok'); await flush(O);
  sp = await serverPos(O);
  assert(sp.find(x=>x.no===2).approvedBy==='owner', 'owner approval stamped');
  // manager sends #1 to vendor
  await fresh(M); await E(M, `window.__wa=[]; window.open=function(u){ window.__wa.push(decodeURIComponent(u)); }`);
  await M.click(`[data-po="${sp.find(x=>x.no===1).id}"]`); await M.click('#pd_wa'); await flush(M);
  const wa = await E(M, 'window.__wa[0]');
  assert(/PO-0001/.test(wa) && /Paneer — 2 kg/.test(wa), 'WhatsApp purchase order text: '+wa.slice(0,120));
  // chef receives 1.5 kg at 320, pay later
  await fresh(C);
  await C.click(`[data-po="${sp.find(x=>x.no===1).id}"]`); await C.click('#pd_rcv');
  await C.fill('[data-rq="0"]','1.5'); await C.fill('[data-rr="0"]','320'); await C.dispatchEvent('[data-rr="0"]','input');
  const fl = await C.textContent('#rf_0');
  assert(/short by 0.5/.test(fl) && /higher than expected/.test(fl), 'receiving flags short and pricier: '+fl);
  await C.click('#rc_s'); await flush(C);
  sp = await serverPos(C); let p1 = sp.find(x=>x.no===1);
  assert(p1.status==='partial' && p1.received.length===1, 'part received');
  cur = await call(O, 'GET', '/api/data'+Q);
  const pr = cur.json.items.purchases_v1.value.filter(x=>x.poId===p1.id);
  assert(pr.length===1 && pr[0].qty===1.5 && pr[0].rate===320 && pr[0].mode==='Credit' && pr[0].vendor==='Sharma Dairy' && pr[0].by==='chef-1', 'purchase created from delivery (pay later): '+JSON.stringify(pr));
  // rest arrives
  await fresh(C); await C.click(`[data-po="${p1.id}"]`); await C.click('#pd_rcv');
  assert(await E(C, `document.querySelector('[data-rq="0"]').value`)==='0.5', 'second delivery expects the remaining 0.5 kg');
  await C.click('#rc_s'); await flush(C);
  sp = await serverPos(C); p1 = sp.find(x=>x.no===1);
  assert(p1.status==='received' && p1.approvedBy==='mgr-1', 'fully received; approval stamp unchanged');
  assert((p1.history||[]).map(h=>h.what).join('|').includes('requested') && (p1.history||[]).length>=5, 'history kept: '+(p1.history||[]).map(h=>h.what).join(' | '));
  await fresh(O); await O.screenshot({ path: process.env.S+'/orders.png' });
  await O.click(`#ordersView [data-po="${p1.id}"]`); await O.screenshot({ path: process.env.S+'/order_detail.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
