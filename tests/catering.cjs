// Party catering (own menu, orders, advance, settle with udhaar) and hotel collab orders (own rates, account, statement).
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2, acceptDownloads:true })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  await E(p, `menuItems=[{id:'chai',name:'Masala Chai',category:'Tea',price:20,active:true},{id:'thali',name:'Veg Thali',category:'Thali',price:150,active:true},{id:'paneer',name:'Paneer Butter Masala',category:'Main',price:220,active:true}];
    sales=[]; customers=[]; creditPayments=[]; dishLog=[]; liveOrders=[]; caterMenu=[]; caterOrders=[]; hotels=[]; hotelOrders=[]; settings.cateringOn=true; settings.hotelsOn=true;
    saveMenu(); saveSales(); saveCustomers(); saveCreditPayments(); saveDishLog(); saveLive(); saveSettings(); renderAll(); showView('counter');`);
  assert(await p.isVisible('#ct_cater') && await p.isVisible('#ct_hotel'), 'Counter shows 🎉 Party orders and 🏨 Hotel order');
  // ---- Catering ----
  await p.click('#ct_cater'); await p.waitForTimeout(100);
  await p.click('#ct_neword'); await p.waitForTimeout(100);
  assert(/catering items first/.test(await p.textContent('#dlgMsg')), 'needs a catering menu first'); await p.click('#dlgBtns button');
  for (const [n, r, u] of [['Veg thali (party)', '180', 'plate'], ['Paneer tikka', '900', 'kg'], ['Gulab jamun', '15', 'piece']]) {
    await p.click('#ct_newitem'); await p.fill('#ci_name', n); await p.fill('#ci_rate', r); await p.selectOption('#ci_unit', u); if (u==='piece') await p.fill('#ci_min', '50'); await p.click('#ci_save');
  }
  assert(await E(p, 'caterMenu.length')===3 && /₹900 \/ kg/.test(await p.textContent('#cateringView')), 'catering menu: 3 items with their own units');
  await p.click('[data-cts="orders"]'); await p.click('#ct_neword');
  await p.fill('#co_cust', 'Mehta family'); await p.fill('#co_phone', '9811122233'); await p.fill('#co_event', 'Birthday'); await p.fill('#co_guests', '40'); await p.fill('#co_venue', 'Green Park community hall');
  await p.selectOption('#co_pick', { label:'Veg thali (party) · ₹180/plate' }); await p.waitForTimeout(80);
  await p.selectOption('#co_pick', { label:'Paneer tikka · ₹900/kg' }); await p.waitForTimeout(80);
  await p.fill('[data-cq="1"]', '3'); await p.press('[data-cq="1"]', 'Tab'); await p.waitForTimeout(80);
  await p.selectOption('#co_pick', { label:'Gulab jamun · ₹15/piece' }); await p.waitForTimeout(80);
  await p.fill('[data-cq="2"]', '30'); await p.press('[data-cq="2"]', 'Tab'); await p.waitForTimeout(80);
  await p.click('[data-xadd="Transport"]'); await p.fill('[data-xa="0"]', '500'); await p.press('[data-xa="0"]', 'Tab'); await p.waitForTimeout(80);
  await p.fill('#co_disc', '200'); await p.press('#co_disc', 'Tab'); await p.waitForTimeout(80);
  await p.click('#co_save'); await p.waitForTimeout(80);
  assert(/minimum order is 50/.test(await p.textContent('.err')), 'minimum order checked (Gulab jamun min 50)');
  await p.fill('[data-cq="2"]', '80'); await p.press('[data-cq="2"]', 'Tab'); await p.waitForTimeout(80);
  // 40×180 + 3×900 + 80×15 + 500 − 200 = 7200+2700+1200+500−200 = 11400
  assert(/₹11,400/.test(await p.textContent('#sheet')) && /₹285 per guest/.test(await p.textContent('#sheet')), 'total ₹11,400 (₹285 per guest)');
  await p.fill('#co_adv', '5000'); await p.selectOption('#co_advmode', 'UPI'); await p.click('#co_save'); await p.waitForTimeout(150);
  let o = await E(p, `JSON.stringify({ st:caterOrders[0].status, no:caterOrders[0].no, paid:ctTotals(caterOrders[0]).paid, due:ctTotals(caterOrders[0]).due, sale:[sales[0].amount, sales[0].mode, sales[0].catering===caterOrders[0].id] })`);
  assert(o==='{"st":"confirmed","no":1,"paid":5000,"due":6400,"sale":[5000,"UPI",true]}', 'order C-1 confirmed with ₹5,000 UPI advance (a sale today), ₹6,400 due: '+o);
  await p.screenshot({ path: process.env.S+'/catering_order.png' });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout:15000 }).catch(()=>null), p.click('#cd_pdf')]);
  assert(dl && /Catering_C1\.pdf$/.test(dl.suggestedFilename()), 'quotation PDF made');
  await p.click('#cd_next'); await p.click('#cd_next'); await p.waitForTimeout(80);
  assert(await E(p, 'caterOrders[0].status')==='delivered', 'Food ready → Delivered');
  await E(p, 'closeForm()'); await p.click('[data-cts="prep"]');
  assert(/No confirmed party orders/.test(await p.textContent('#cateringView')), 'prep list only for confirmed / ready orders');
  await E(p, `openCaterOrder(caterOrders[0].id)`); await p.click('#cd_next'); await p.waitForTimeout(80);
  assert(/₹6,400 is still due/.test(await p.textContent('#dlgMsg')), 'settling asks how the balance was paid');
  await p.click('#dlgBtns button:nth-child(3)'); await p.waitForTimeout(150);
  o = await E(p, `JSON.stringify({ st:caterOrders[0].status, due:ctTotals(caterOrders[0]).due, credit:sales.filter(function(s){ return s.mode==="Credit" && s.customer==="Mehta family"; }).map(function(s){ return s.amount; }), total:sales.filter(function(s){ return s.catering; }).reduce(function(a,s){ return a+s.amount; },0) })`);
  assert(o==='{"st":"settled","due":0,"credit":[6400],"total":11400}', 'settled: ₹6,400 on udhaar, sales total = order total ₹11,400: '+o);
  await E(p, 'closeForm()');
  // ---- Hotels ----
  await E(p, `showView('records'); switchRecordsSub('hotels'); htSub='hotels'; renderHotelsView();`);
  await p.click('#ht_newh'); await p.fill('#hf_name', 'Hotel Sunrise'); await p.fill('#hf_phone', '9822200011'); await p.fill('#hf_disc', '10');
  await p.fill('[data-hr="paneer"]', '180'); await p.click('#hf_addx'); await p.fill('[data-xn="0"]', 'Jain thali'); await p.fill('[data-xp="0"]', '160'); await p.click('#hf_save'); await p.waitForTimeout(100);
  const hm = await E(p, `JSON.stringify(hotelMenu(hotels[0]).map(function(m){ return m.name+":"+m.price; }))`);
  assert(hm==='["Masala Chai:18","Veg Thali:135","Paneer Butter Masala:180","Jain thali:160"]', 'hotel menu: 10% off, own price for paneer, extra dish: '+hm);
  assert(await E(p, `customers.some(function(c){ return c.name==="Hotel Sunrise"; })`), 'hotel gets a customer record for its account');
  await p.click('[data-hts="orders"]'); await p.click('[data-htnew]');
  await p.fill('#ho_room', '204'); await p.click('[data-hm="thali"]'); await p.click('[data-hm="thali"]'); await p.click('[data-hm="x:'+(await E(p, 'hotels[0].extras[0].id'))+'"]'); await p.waitForTimeout(80);
  assert(/₹430/.test(await p.textContent('#sheet')), 'order total at hotel rates (2×135 + 160 = ₹430)');
  await p.screenshot({ path: process.env.S+'/hotel_order.png' });
  await p.click('#ho_ok'); await p.waitForTimeout(150); await p.click('#dlgBtns button').catch(()=>{});
  const h = await E(p, `JSON.stringify({ ho:[hotelOrders[0].no, hotelOrders[0].total, hotelOrders[0].mode, hotelOrders[0].room], sale:(function(){ var s = sales.find(function(x){ return x.order && x.order.type==="hotel"; }); return [s.customer, s.amount, s.mode]; })(), tk:liveOrders.filter(function(t){ return t.hotel; }).map(function(t){ return [t.type, t.paid, t.address]; }), dish:dishLog.filter(function(d){ return d.menuId==="thali"; }).reduce(function(a,d){ return a+d.qty; },0), due:hotelDue(hotels[0]) })`);
  assert(h==='{"ho":[1,430,"Credit","204"],"sale":["Hotel Sunrise",430,"Credit"],"tk":[["delivery",true,"Room 204 · Hotel Sunrise"]],"dish":2,"due":430}', 'hotel order: on account (udhaar ₹430), kitchen ticket, dish counts: '+h);
  // Hotel pays ₹300 through the usual udhaar payment
  await E(p, `creditPayments.push({ id:uid(), customerId:customers.find(function(c){ return c.name==="Hotel Sunrise"; }).id, date:fmtDate(new Date()), amount:300, mode:"UPI" }); saveCreditPayments(); renderAll();`);
  assert(await E(p, 'hotelDue(hotels[0])')===130, 'after ₹300 paid: ₹130 due');
  await p.click('[data-hts="statement"]');
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout:15000 }).catch(()=>null), p.click('[data-htpdf]')]);
  assert(dl2 && /Hotel_Sunrise_Statement_\d{4}-\d\d\.pdf$/.test(dl2.suggestedFilename()), 'monthly statement PDF');
  // Cancel the hotel order (same day): bill removed, ticket cancelled
  await E(p, `openHotelOrderView(hotelOrders[0].id)`); await p.click('#hv_cx'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(150);
  assert(await E(p, `hotelOrders[0].status==="cancelled" && !sales.some(function(s){ return s.order && s.order.type==="hotel"; }) && liveOrders.find(function(t){ return t.hotel; }).status==="cancelled" && checks.some(function(c){ return c.kind==="void" && /Hotel H-1/.test(c.items); })`), 'hotel order cancelled: bill removed (kept as a cancel record), ticket cancelled');
  // Switches off → tabs hidden
  await E(p, `settings.cateringOn=false; settings.hotelsOn=false; saveSettings(); renderAll(); showView('records');`);
  assert(!(await p.isVisible('#recCtl button[data-r="catering"]')) && !(await p.isVisible('#recCtl button[data-r="hotels"]')), 'switched off: tabs hidden');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
