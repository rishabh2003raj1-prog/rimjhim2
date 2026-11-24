// Purchase orders: owner's own order waits for ✔ Approve (setting), Edit, and editing an approved order needs approval again.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  await E(p, `pos=[]; savePos(); showView('records'); switchRecordsSub('orders'); openPoForm(null);`);
  assert(/^Save$/.test((await p.textContent('#po_save')).trim()), 'owner sees "Save", not "Save & approve"');
  await p.fill('#po_vendor', 'Any shop'); await p.fill('[data-pl="0"][data-f="item"]', 'Aata'); await p.press('[data-pl="0"][data-f="item"]', 'Tab'); await p.waitForTimeout(100); await p.fill('[data-pl="0"][data-f="qty"]', '2'); await p.fill('[data-pl="0"][data-f="rate"]', '38');
  await p.click('#po_save'); await p.waitForTimeout(200);
  let st = await E(p, 'pos[0].status');
  assert(st==='review', 'owner order waits for approval: '+st);
  await E(p, `openPoDetail(pos[0].id)`);
  assert(await p.$('#pd_ok') && await p.$('#pd_edit'), 'detail has ✔ Approve and ✏️ Edit');
  await p.click('#pd_ok'); await p.waitForTimeout(200);
  assert(await E(p, 'pos[0].status')==='approved', 'approved with a separate tap');
  // Edit an approved order: change qty → needs approval again
  assert(await p.$('#pd_edit'), 'approved order can be edited');
  await p.click('#pd_edit'); await p.fill('[data-pl="0"][data-f="qty"]', '5'); await p.click('#po_save'); await p.waitForTimeout(200);
  st = await E(p, 'pos[0].status');
  assert(st==='review' && /needs approval again/.test(JSON.stringify(await E(p, 'pos[0].history'))), 'changing quantity sends it back for approval');
  await E(p, `openPoDetail(pos[0].id)`); await p.click('#pd_ok'); await p.waitForTimeout(200);
  // Editing only the note keeps it approved
  await E(p, `openPoForm(pos[0].id)`); await p.fill('#po_note', 'fresh stock please'); await p.click('#po_save'); await p.waitForTimeout(200);
  assert(await E(p, 'pos[0].status')==='approved', 'changing only the note keeps it approved');
  await p.waitForTimeout(2500);
  const srv = (await call(p, 'GET', '/api/data?outlet=rimjhim')).json.items.pos_v1.value[0];
  assert(srv.status==='approved' && srv.approvedBy==='owner', 'server stamped the approval');
  // Setting: approve as soon as I save
  await E(p, `closeForm(); openPoLimit()`); await p.selectOption('#pl_self', 'auto'); await p.click('#pl_s'); await p.waitForTimeout(150);
  await E(p, `openPoForm(null)`);
  assert(/Save & approve/.test(await p.textContent('#po_save')), 'with the setting: "Save & approve"');
  await p.fill('#po_vendor', 'Dairy'); await p.fill('[data-pl="0"][data-f="item"]', 'Milk'); await p.press('[data-pl="0"][data-f="item"]', 'Tab'); await p.waitForTimeout(100); await p.fill('[data-pl="0"][data-f="qty"]', '10'); await p.fill('[data-pl="0"][data-f="rate"]', '60');
  await p.click('#po_save'); await p.waitForTimeout(200);
  assert(await E(p, 'pos[1].status')==='approved', 'approved on save when chosen');
  await p.waitForTimeout(2500);
  // Server: a manager can't raise an approved order above the limit
  await call(p, 'POST', '/api/users', { login:'mgr-1', outlet:'rimjhim', name:'Ravi', access:'manager', password:'secret123' });
  const m = await (await b.newContext()).newPage(); await m.goto('http://127.0.0.1:8787/');
  await m.evaluate(async () => { await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ login:'mgr-1', password:'secret123' }) }); });
  const d = (await call(m, 'GET', '/api/data?outlet=rimjhim')).json.items.pos_v1;
  const v = JSON.parse(JSON.stringify(d.value)); v[1].lines[0].qty = 100;  // 100 × 60 = 6000 > 2000
  const r = await call(m, 'PUT', '/api/data/pos_v1?outlet=rimjhim', { value:v, baseRev:d.rev });
  assert(r.status===403 && /approval again/.test(r.json.error), 'server refuses a manager raising an approved order: '+r.status);
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
