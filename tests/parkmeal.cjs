// Parking waivers: a driver's meal billed at the Counter frees that day; stay calendar; Calendar day card.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  await E(p, `settings.parkingOn = true; menuItems=[{id:'thali',name:'Veg Thali',category:'Thali',price:120,active:true},{id:'chai',name:'Chai',category:'Tea',price:20,active:true}]; saveMenu();
    var t0 = Date.now() - 2*86400000 - 3600000; parking=[{ id:'pk1', no:1, vtype:'truck', vno:'BR06PG9390', driver:'Dipak Kumar', phone:'8544756481', rate:150, inAt:t0, inDate:fmtDate(new Date(t0)), inTime:'10:00', status:'in', bel:{}, payments:[], waiveDays:[] }];
    saveParking(); saveSettings(); renderAll(); showView('records'); switchRecordsSub('parking');`);
  // minimum meal bill ₹100
  await p.click('#pk_rates'); await p.fill('#pr_meal', '100'); await p.click('#pr_s'); await p.waitForTimeout(150);
  assert(await E(p, 'parkMealMin()')===100, 'minimum meal bill set to ₹100');
  // Counter: chai only → below minimum
  await E(p, `showView('counter'); counterType='take'; renderCounter();`);
  await p.click('.ctile[data-add="chai"]'); await p.click('#ct_go'); await p.waitForSelector('#pp_park');
  await p.selectOption('#pp_park', 'pk1'); await p.waitForTimeout(80);
  assert(/below ₹100/.test(await p.textContent('.ppark')), 'chai alone (₹20): below the minimum, stays charged');
  await p.click('#pp_back'); await p.click('.ctile[data-add="thali"]'); await p.click('#ct_go'); await p.waitForSelector('#pp_park');
  assert(await p.$eval('#pp_park', e => e.value)==='pk1' && /becomes free/.test(await p.textContent('.ppark')), 'with a thali (₹140): today becomes free');
  await p.screenshot({ path: process.env.S+'/parkmeal_bill.png' });
  await p.click('[data-pay="cash"]'); await p.click('#pp_done'); await p.waitForTimeout(200);
  assert(/Parking today free for BR06PG9390/.test(await p.textContent('.pdone')), 'bill saved screen says parking is free today');
  const t = await E(p, 'fmtDate(new Date())');
  let r = await E(p, `JSON.stringify({ w:parking[0].waiveDays, m:(parking[0].meals||[]).length, link:(sales.find(function(s){ return s.order && s.order.parkId==="pk1"; })||{}).amount })`);
  console.log('   '+r);
  assert(r===JSON.stringify({ w:[t], m:1, link:140 }), 'bill linked to the truck; today is free');
  // Stay calendar
  await E(p, `closeForm(); showView('records'); switchRecordsSub('parking');`);
  await p.click('#parkingView [data-pkcal]'); await p.waitForSelector('.staycal');
  const cells = await p.$$eval('.scd', a => a.map(x => x.className.includes('free') ? 'F' : 'P').join(''));
  assert(cells==='PPF', 'stay calendar: 3 days, today free: '+cells);
  assert(/bill ₹140/.test(await p.textContent('.staycal')), 'the meal bill shows on that day');
  const y = await E(p, `addDays(fmtDate(new Date()), -1)`);
  await p.click(`[data-sd="${y}"]`); await p.waitForTimeout(100);
  assert(await E(p, `parkBill(parking[0]).waived`)===2 && /Freedays\(atehere\)2/.test((await p.textContent('#sheet')).replace(/\s+/g,'')), 'tap yesterday: 2 free days');
  await p.screenshot({ path: process.env.S+'/parkmeal_cal.png' });
  // App Calendar day card
  await E(p, `closeForm(); selectedDate = fmtDate(new Date()); showView('calendar'); renderAll();`); await p.waitForTimeout(150);
  const dc = (await p.textContent('#dayPanel')).replace(/\s+/g,'');
  assert(/Parking/.test(dc) && /BR06PG9390/.test(dc) && /🍽️free/.test(dc) && /Freedaysgiven\(driveratehere\)1/.test(dc), 'Calendar day shows parked vehicles and free days');
  await p.click('#dayPanel [data-pkcal]'); assert(await p.$('.staycal'), 'tap a vehicle in the Calendar to open its stay calendar');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
