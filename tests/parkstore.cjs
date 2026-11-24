// Parking and general store: off by default; multi-day parking with waived days and belongings; store billing, stock, order list, margins.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
async function open(b, errs, id, pw){ const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); if(id) await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(2000); return p; }
const dis = (p) => p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
(async () => {
  const b = await chromium.launch(), errs = [];
  const O = await open(b, errs, '', '1234');
  await E(O, `menuItems=[{id:'chai',name:'Chai',category:'Tea',price:20,active:true}]; saveMenu(); renderAll(); showView('counter');`);
  assert(!(await O.$('#ct_park')) && !(await O.$('#ct_store')) && await O.$eval('#recCtl [data-r="parking"]', e => e.style.display==='none'), 'off by default: no Parking / Store anywhere');
  await O.click('#ct_upi'); await O.selectOption('#up_park', 'on'); await O.selectOption('#up_store', 'on'); await O.click('#up_save'); await O.waitForTimeout(300); await dis(O);
  assert(await E(O, 'settings.parkingOn===true && settings.storeOn===true') && await O.$('#ct_park') && await O.$('#ct_store'), 'switched on in Counter settings: buttons appear');
  // ---- parking ----
  await O.click('#ct_park'); await O.waitForTimeout(150);
  await O.click('#pk_in'); await O.click('[data-vt="truck"]'); await O.fill('#pk_no', 'mp09 ab 1234'); await O.fill('#pk_dr', 'Balwinder'); await O.fill('#pk_ph', '9876543210');
  await O.selectOption('#pk_ds', '½'); await O.click('[data-bel="key"]'); await O.click('[data-bel="tirpal"]'); await O.fill('#pk_other', 'key no. 14');
  await O.fill('#pk_adv', '100'); await O.screenshot({ path: process.env.S+'/parking_in.png' });
  await O.click('#pk_s'); await O.waitForTimeout(150);
  let pk = await E(O, `JSON.stringify(parking.map(function(p){ return [p.vno, p.vtype, p.rate, p.diesel, p.bel.key, p.bel.tirpal, p.bel.other, p.payments.length]; }))`);
  assert(pk==='[["MP09 AB 1234","truck",150,"½",true,true,"key no. 14",1]]', 'truck parked with belongings and advance: '+pk);
  // 3.5 days later, driver ate here two days
  await E(O, `var p = parking[0]; p.inAt = Date.now() - 3.5*86400000; p.inDate = fmtDate(new Date(p.inAt)); p.waiveDays = [addDays(fmtDate(new Date()), -1)]; saveParking(); renderAll(); switchRecordsSub('parking');`);
  await O.click('[data-pkate]'); await O.waitForTimeout(100);
  let bl = await E(O, 'JSON.stringify(parkBill(parking[0]))');
  console.log('   '+bl);
  assert(/"days":4,"waived":2,"charged":2,"amount":300,"paid":100,"due":200/.test(bl), '4 days, 2 free (ate here), ₹300, paid ₹100, ₹200 due');
  await O.screenshot({ path: process.env.S+'/parking_list.png' });
  await O.click('[data-pkout]'); await O.waitForSelector('#po_s');
  await O.click('#po_s'); assert(/Tick everything given back/.test(await O.textContent('#po_err')), 'must tick belongings returned');
  for (const c of await O.$$('[data-ret]')) await c.check();
  assert(await O.$eval('#po_amt', e => e.value)==='200', 'asks to collect ₹200');
  await O.screenshot({ path: process.env.S+'/parking_out.png' });
  await O.click('#po_s'); await O.waitForTimeout(150);
  const t = await E(O, 'fmtDate(new Date())');
  assert(await E(O, `parking[0].status==="out" && parkBill(parking[0]).due===0`), 'checked out, nothing due');
  assert(await E(O, `parkPaymentsIn(function(d){ return d==="${t}"; })`)===300 && await E(O, `cashMovement("${t}").inPark`)===300, 'parking ₹300 counted as income and in the counter cash');
  // ---- store ----
  await E(O, `showView('records'); switchRecordsSub('store'); storeSub='stock'; renderStoreView();`);
  async function item(n, cost, sell, stock, min){ await O.click('#st_add'); await O.fill('#si_name', n); await O.fill('#si_cost', String(cost)); await O.fill('#si_sell', String(sell)); await O.fill('#si_open', String(stock)); await O.fill('#si_min', String(min)); await O.click('#si_s'); await O.waitForTimeout(100); }
  await item('Parle-G', 8, 10, 50, 10); await item('Bisleri 1L', 16, 20, 24, 6); await item('Gutka', 9.5, 10, 30, 5);
  assert(await E(O, 'storeItems.length')===3, 'three store items');
  await E(O, `storeSub='bill'; renderStoreView();`);
  const pid = await E(O, `storeItems.find(function(x){ return x.name==='Parle-G'; }).id`), gid = await E(O, `storeItems.find(function(x){ return x.name==='Gutka'; }).id`);
  for (let i = 0; i < 3; i++) await O.click(`[data-sadd="${pid}"]`);
  await O.click(`[data-sadd="${gid}"]`);
  await O.screenshot({ path: process.env.S+'/store_bill.png' });
  await O.click('[data-spay="Cash"]'); await O.waitForTimeout(150); await dis(O);
  assert(await E(O, `storeSales.length===1 && storeSales[0].total===40 && storeStock(storeItem("${pid}"))===47`), 'store bill ₹40 saved, Parle-G stock 50 → 47');
  assert(await E(O, `sales.length===0`), 'store bill kept out of cafe sales');
  // order list after a recount
  await E(O, `var it = storeItem("${pid}"); it.open = 8; it.openAt = Date.now(); saveStoreItems(); storeSub='order'; renderStoreView();`);
  assert(/Parle-G/.test(await O.textContent('#storeView')) && /12 pcs/.test(await O.textContent('#storeView')), 'order list: Parle-G, order 12');
  // buy stock
  await E(O, `storeSub='buy'; renderStoreView();`); await O.click('#st_buy'); await O.selectOption('[data-sbi="0"]', pid); await O.fill('[data-sbq="0"]', '24'); await O.fill('[data-sbc="0"]', '8.5'); await O.click('#sb_s'); await O.waitForTimeout(150);
  assert(await E(O, `storeStock(storeItem("${pid}"))===32 && storeItem("${pid}").cost===8.5`), 'stock bought: 8 → 32, buying price updated to ₹8.50');
  // margins
  await E(O, `storeSub='report'; renderStoreView();`);
  const rp = (await O.textContent('#storeView')).replace(/\s+/g,' ');
  assert(/Low margin/.test(rp) && /Gutka/.test(rp) && /5%/.test(rp), 'margin report flags Gutka at 5%');
  await O.screenshot({ path: process.env.S+'/store_report.png' });
  const oi = await E(O, `otherIncomeIn(function(d){ return d==="${t}"; })`);
  assert(oi===300, 'cafe profit gets parking (300) but not the store (own account): '+oi);
  assert(await E(O, `cashMovement("${t}").inflow`)===300, 'cafe counter cash: parking yes, store no');
  // Store's own money
  await E(O, `storeSub='money'; renderStoreView();`);
  await O.fill('#so_cash', '500'); await O.fill('#so_date', '${t}'.length ? await E(O,'fmtDate(new Date())') : ''); await O.click('#so_s'); await O.waitForTimeout(150);
  await E(O, `storeSub='money'; renderStoreView();`);
  assert(await E(O, `storeMoney(fmtDate(new Date())).cash`)===336, 'store drawer: 500 opening + 40 cash bill − 204 stock = 336');
  await O.fill('#sm_cnt', '336'); await O.click('#sm_cnt_s'); await O.waitForTimeout(150);
  assert(/₹336 ✔/.test(await O.textContent('#storeView')), 'store closing count matches');
  await O.selectOption('#sm_type', 'deposit'); await O.fill('#sm_amt', '100'); await O.click('#sm_move'); await O.waitForTimeout(150);
  assert(await E(O, `JSON.stringify(storeMoney(fmtDate(new Date())))`)==='{"cash":236,"bank":100}', 'deposit moves store cash to the store bank');
  await O.screenshot({ path: process.env.S+'/store_money.png' });
  // Cafe + parking closing split
  await E(O, `openCashDayForm("${t}")`); await O.fill('#cd_counted', '1300');
  const sp = (await O.textContent('#cd_split')).replace(/\s+/g,' ');
  assert(/Parking cash — keep aside ?₹300/.test(sp) && /Cafe cash \(counted − parking\) ?₹1,000/.test(sp), 'closing split: parking ₹300 aside, cafe ₹1,000: '+sp);
  await O.screenshot({ path: process.env.S+'/closing_split.png' });
  await E(O, 'closeForm()');
  await E(O, `showView('dashboard'); renderAll();`);
  assert(/Other businesses/.test(await O.textContent('#extraBizBox')) && /Parking/.test(await O.textContent('#extraBizBox')), 'Dashboard shows other businesses');
  await O.waitForTimeout(2500);
  // billing staff
  await call(O, 'POST', '/api/users', { login:'bill-1', outlet:'rimjhim', name:'Sita', access:'billing', password:'secret123' });
  const B = await open(b, errs, 'bill-1', 'secret123');
  await E(B, `showView('records'); switchRecordsSub('store');`); await B.waitForTimeout(200);
  assert(await B.$eval('#recCtl [data-r="store"]', e => e.style.display!=='none') && !(await B.$('[data-ss="buy"]')), 'billing sees the store but not Buy stock');
  await B.click(`[data-sadd="${pid}"]`); await B.click('[data-spay="UPI"]'); await B.waitForTimeout(2500); await dis(B);
  const srv = await call(O, 'GET', '/api/data?outlet=rimjhim');
  assert((srv.json.items.storesales_v1.value||[]).filter(x => !x.kind).length===2 && srv.json.items.storesales_v1.value.some(x => x.by==='bill-1' && x.mode==='UPI'), 'billing store bill saved on the server');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
