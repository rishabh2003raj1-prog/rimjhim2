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
  await O.click('#pk_in'); await O.click('[data-vt="truck"]'); await O.fill('#pk_no', 'nl01aj-9970'); await O.fill('#pk_dr', 'Abdul Hasan'); await O.fill('#pk_ph', '7972270334');
  assert(await O.$eval('#pk_rate', e => e.value)==='150', 'truck rate filled in (₹150/day)');
  await O.fill('#pk_ds2', '17 अंगुली'); await O.click('[data-key="1"]');
  await O.click('[data-bp="battery"]'); await O.click('[data-bp="battery"]'); await O.click('[data-bp="stepney"]'); await O.click('[data-bp="tirpal"]');
  assert(await O.textContent('[data-bn="battery"]')==='2' && await O.textContent('[data-bn="jack"]')==='✗', 'counts: battery 2, jack ✗');
  await O.fill('#pk_other', 'key no. 14');
  // photos: vehicle + a document (RC)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGP8z8Dwn4GBgYGJgYGBgYGBgYEBAA0IAQH7c9e7AAAAAElFTkSuQmCC', 'base64');
  await O.click('#pk_vadd');
  assert(/Add a photo/.test(await O.textContent('#dlgMsg')) && /Take photo with camera/.test(await O.textContent('#dlgBtns')) && /Choose from gallery/.test(await O.textContent('#dlgBtns')), 'vehicle photo: choose camera or gallery');
  let [fc] = await Promise.all([O.waitForEvent('filechooser'), O.click('#dlgBtns button:nth-child(1)')]);
  assert(await fc.element().evaluate(e => e.getAttribute('capture'))==='environment', 'camera choice opens the camera (capture=environment)'); await fc.setFiles({ name:'truck.png', mimeType:'image/png', buffer:png });
  await O.waitForSelector('#pk_vpics img');
  await O.selectOption('#pk_dkind', 'RC (registration)');
  await O.click('#pk_dadd'); [fc] = await Promise.all([O.waitForEvent('filechooser'), O.click('#dlgBtns button:nth-child(2)')]);
  assert(!(await fc.element().evaluate(e => e.hasAttribute('capture'))), 'gallery choice opens the gallery (no capture)'); await fc.setFiles({ name:'rc.png', mimeType:'image/png', buffer:png });
  await O.waitForSelector('#pk_dpics img');
  assert(/RC \(registration\)/.test(await O.textContent('#pk_dpics')), 'vehicle photo and RC document added');
  await O.click('#pk_vpics img'); assert(await O.$('.photoview img'), 'tap a photo to see it large'); await O.click('.photoview');
  // Truck needs driver ID: blocked without it (the RC photo is not an ID)
  await O.fill('#pk_adv', '100'); await O.click('#pk_s');
  assert(/licence or Aadhaar/.test(await O.textContent('#pk_err')), 'truck without driver ID is refused');
  await O.selectOption('#pk_idt', 'Aadhaar'); await O.fill('#pk_idn', '1234 5678'); await O.click('#pk_s');
  assert(/12 digits/.test(await O.textContent('#pk_err')), 'short Aadhaar refused');
  await O.fill('#pk_idn', '3345 5989 7522');
  await O.click('#pk_s');
  assert(/sign in the box/.test(await O.textContent('#pk_err')), 'truck needs the driver to sign');
  const bx = await O.$eval('#pk_sign', e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await O.mouse.move(bx[0]+20, bx[1]+bx[3]/2); await O.mouse.down(); for (let i = 1; i <= 10; i++) await O.mouse.move(bx[0]+20+i*25, bx[1]+bx[3]/2 + (i%2 ? -20 : 20)); await O.mouse.up();
  await O.screenshot({ path: process.env.S+'/parking_in.png' });
  await O.click('#pk_s'); await O.waitForTimeout(150);
  let pk = await E(O, `JSON.stringify(parking.map(function(p){ return [p.no, p.vno, p.vtype, p.rate, p.diesel, p.bel.key, p.bel.battery, p.bel.stepney, p.bel.jack||0, p.bel.tirpal, p.bel.other, p.payments.length, (p.pics||[]).filter(function(x){ return x.kind==="sign"; }).length]; }))`);
  assert(pk==='[[1,"NL01AJ-9970","truck",150,"17 अंगुली",true,2,1,0,1,"key no. 14",1,1]]', 'truck parked like the paper slip (counts, diesel in words, key with us, signature): '+pk);
  assert(/📷 1 · 📄 1/.test(await O.textContent('#parkingView')), 'parked card shows photo and document count');
  assert(/Aadhaar ••••7522/.test(await O.textContent('#parkingView')) && !/3345 5989/.test(await O.textContent('#parkingView')), 'card shows only the last 4 Aadhaar digits');
  assert(/Battery ×2/.test(await O.textContent('#parkingView')), 'card lists Battery ×2');
  // A car does not need an ID
  await O.click('#pk_in'); await O.click('[data-vt="car"]'); assert(await O.$eval('#pk_rate', e => e.value)==='50', 'rate follows the vehicle type');
  await O.fill('#pk_rate', '30'); await O.fill('#pk_no', 'MP04 CC 1111'); await O.click('#pk_s'); await O.waitForTimeout(150);
  assert(await E(O, `parking.some(function(p){ return p.vno==="MP04 CC 1111" && p.rate===30; })`), 'car parks without ID or signature, at an agreed ₹30/day');
  await E(O, `parking = parking.filter(function(p){ return p.vno!=="MP04 CC 1111"; }); saveParking(); renderAll();`);
  await O.waitForTimeout(3500);
  const srvp = (await call(O, 'GET', '/api/data?outlet=rimjhim')).json.items.parking_v1.value[0].pics || [];
  assert(srvp.length===3 && srvp.every(x => /^\/api\/photos\//.test(x.src)) && srvp.some(x => x.kind==='doc' && x.label==='RC (registration)') && srvp.some(x => x.kind==='sign'), 'photos uploaded to photo storage (not kept inside the list)');
  // 3.5 days later, driver ate here two days
  await E(O, `var p = parking[0]; p.inDate = addDays(fmtDate(new Date()), -3); p.inAt = parseDate(p.inDate).getTime() + 20*3600000; p.waiveDays = [addDays(fmtDate(new Date()), -1)]; saveParking(); renderAll(); switchRecordsSub('parking');`);
  await O.click('[data-pkate]'); await O.waitForTimeout(100);
  let bl = await E(O, 'JSON.stringify(parkBill(parking[0]))');
  console.log('   '+bl);
  assert(/"days":3,"nights":3,"waived":1,"charged":2,"amount":300,"paid":100,"due":200/.test(bl), '3 nights, one night free (two days marked, one free per stay), ₹300, paid ₹100, ₹200 due');
  assert(await E(O, `JSON.stringify([parkNights({ inDate:"2026-01-05", outDate:"2026-01-05" }), parkNights({ inDate:"2026-01-05", outDate:"2026-01-06" }), parkNights({ inDate:"2026-01-05", outDate:"2026-01-08" })])`)==='[1,1,3]', 'nights: same day = 1, overnight = 1, Mon→Thu = 3');
  await O.screenshot({ path: process.env.S+'/parking_list.png' });
  await O.click('[data-pkout]'); await O.waitForSelector('#po_s');
  await O.click('#po_s'); assert(/Tick everything given back/.test(await O.textContent('#po_err')), 'must tick belongings returned');
  const rets = (await O.$$eval('.belret', a => a.map(x => x.textContent.trim()))).join(' | ');
  assert(/Key/.test(rets) && /Battery × 2/.test(rets) && /Stepney/.test(rets) && /Tirpal/.test(rets) && !/Jack/.test(rets), 'check-out lists what to give back with counts: '+rets);
  const [dl] = await Promise.all([O.waitForEvent('download'), O.click('#po_slip')]);
  const slipPath = (process.env.S||'.')+'/parking_slip.pdf'; await dl.saveAs(slipPath);
  assert(fs.statSync(slipPath).size > 20000 && /Parking_NL01AJ-9970/.test(dl.suggestedFilename()), 'parking slip PDF made: '+dl.suggestedFilename());
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
