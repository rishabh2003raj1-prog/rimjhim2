// Tiffin service: plans, menu choices, subscribers, kitchen counts, customer picks / skips in /c, meals left.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function flush(p){ await E(p, 'scheduleFlush(0)'); await p.waitForFunction(() => window.__ev('Object.keys(cloud.dirty).length===0'), null, { timeout:20000 }); }
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  await E(p, `sales=[]; customers=[]; tiffinPlans=[]; tiffinSubs=[]; tiffinMenu=[]; tiffinPicks=[]; settings.tiffinOn=false; settings.tiffinCutoff=null; saveSales(); saveCustomers(); saveSettings(); renderAll(); showView('records');`);
  assert(!(await p.isVisible('#recCtl button[data-r="tiffin"]')), 'switched off: no Tiffin tab');
  await E(p, `showView('counter'); openUpiSettings()`); await p.selectOption('#up_tiffin', 'on'); await p.click('#up_save'); await p.waitForTimeout(150);
  assert(await E(p, 'settings.tiffinOn')===true && await p.isVisible('#ct_tiffin'), 'Settings → Tiffin On: Counter gets a 🍱 Tiffin button');
  await p.click('#ct_tiffin'); await p.waitForTimeout(150);
  assert(await p.isVisible('#tiffinView') && await p.isVisible('#recCtl button[data-r="tiffin"]'), 'Tiffin tab in Records');
  // Plan
  await p.click('[data-tfs="plans"]'); await p.click('#tf_newplan');
  await p.fill('#tp_name', 'Monthly lunch'); await p.fill('#tp_count', '4'); await p.fill('#tp_price', '400'); await p.uncheck('#tp_sun'); await p.fill('#tp_desc', '4 roti, rice, dal, sabzi'); await p.click('#tp_save');
  assert(await E(p, `tiffinPlans.length===1 && tiffinPlans[0].count===4 && tiffinPlans[0].meals.join()==="lunch"`), 'plan saved (4 lunches, ₹400)');
  // Menu for tomorrow's lunch: Dal (fry / makhani), Sabzi (paneer matar / shahi paneer)
  await p.click('[data-tfs="menu"]'); await p.click('[data-tfmday="1"]'); await p.click('[data-tfmeal="lunch"]'); await p.click('#tf_menued');
  await p.fill('#tm_note', '4 roti · rice · salad'); await p.click('#tm_save'); await p.waitForTimeout(100);
  const mn = await E(p, `JSON.stringify(tiffinMenu.map(function(m){ return [m.meal, m.groups.map(function(g){ return g.name+":"+g.options.join("/"); })]; }))`);
  assert(mn==='[["lunch",["Dal:Dal fry/Dal makhani","Sabzi:Paneer matar/Shahi paneer"]]]', 'menu with two choice groups: '+mn);
  // Subscriber
  await p.click('[data-tfs="subs"]'); await p.click('#tf_new');
  await p.fill('#ts_name', 'Neha'); await p.fill('#ts_phone', '98765 00011'); await p.selectOption('#ts_mode', 'UPI'); await p.click('#ts_save'); await p.waitForTimeout(150); await dis();
  const sub = await E(p, `JSON.stringify({ n:tiffinSubs.length, tot:tiffinSubs[0].mealsTotal, start:tiffinSubs[0].start===addDays(fmtDate(new Date()),1), left:tfLeft(tiffinSubs[0]), cust:customers.find(function(c){ return c.id===tiffinSubs[0].customerId; }).phone, sale:[sales[0].amount, sales[0].mode, /Tiffin/.test(sales[0].desc)] })`);
  assert(sub==='{"n":1,"tot":4,"start":true,"left":4,"cust":"9876500011","sale":[400,"UPI",true]}', 'subscriber: 4 tiffins from tomorrow, linked customer, ₹400 UPI sale: '+sub);
  // Kitchen list for tomorrow: the usual (first) options
  await p.click('[data-tfs="kitchen"]'); await p.click('[data-tfday="1"]');
  let kt = (await p.textContent('#tiffinView')).replace(/\s+/g,' ');
  assert(/1 tiffin/.test(kt) && /Dal fry 1/.test(kt) && /Dal makhani 0/.test(kt) && /Paneer matar 1/.test(kt) && /\(usual\)/.test(kt), 'kitchen count for tomorrow: usual choices');
  // Staff change (customer phoned)
  await p.click('[data-tfpick]'); await p.click('[data-o="Dal makhani"]'); await p.click('#tk_ok'); await p.waitForTimeout(100);
  kt = (await p.textContent('#tiffinView')).replace(/\s+/g,' ');
  assert(/Dal makhani 1/.test(kt) && /Dal fry 0/.test(kt) && /✔ picked/.test(kt), 'staff pick changes the count');
  await p.screenshot({ path: process.env.S+'/tiffin_kitchen.png' });
  // App access for Neha → customer app
  await flush(p);
  const cid = await E(p, 'tiffinSubs[0].customerId');
  await E(p, `openCustomerDetail('${cid}')`); await p.waitForSelector('#ca_give'); await p.click('#ca_give'); await p.waitForSelector('.custcode');
  const code = (await p.textContent('.custcode')).replace(/\s/g,''); await E(p, 'closeForm()');
  const C = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage(); C.on('pageerror', e => errs.push('C: '+e.message));
  await C.goto('http://127.0.0.1:8787/c'); await C.fill('#ph', '9876500011'); await C.fill('#cd', code); await C.click('#go'); await C.waitForSelector('#app:not(.hidden)');
  let ct = (await C.textContent('#body')).replace(/\s+/g,' ');
  assert(/Monthly lunch/.test(ct) && /4 of 4 tiffins left/.test(ct) && /Tomorrow · ☀️ Lunch/.test(ct) && /4 roti · rice · salad/.test(ct), 'customer app: plan, 4 left, tomorrow lunch with the menu');
  assert(await C.$eval('[data-v="Dal makhani"]', e => e.classList.contains('on')), 'staff pick shows as chosen');
  await C.click('[data-v="Shahi paneer"]'); await C.waitForTimeout(600);
  assert(/Saved/.test(await C.textContent('.tfmsg')) && await C.$eval('[data-v="Shahi paneer"]', e => e.classList.contains('on')), 'customer picks Shahi paneer: saved');
  await C.screenshot({ path: process.env.S+'/tiffin_customer.png' });
  // Staff phone sees the customer's choice
  await E(p, 'pollRemote()'); await p.waitForFunction(() => window.__ev(`(tiffinPicks[0]||{}).by==="customer"`), null, { timeout:10000 }).catch(()=>{});
  await E(p, 'renderAll()');
  kt = (await p.textContent('#tiffinView')).replace(/\s+/g,' ');
  assert(/Shahi paneer 1/.test(kt) && /Dal makhani 1/.test(kt) && /picked by customer/.test(kt), 'kitchen list shows the customer\'s choice');
  // Customer skips
  await C.click('[data-tfskip]'); await C.waitForTimeout(600);
  assert(/Skipped/.test(await C.textContent('.tfslot')), 'customer skips tomorrow');
  await E(p, 'pollRemote()'); await p.waitForFunction(() => window.__ev(`(tiffinPicks[0]||{}).skip===true`), null, { timeout:10000 }).catch(()=>{}); await E(p, 'renderAll()');
  kt = (await p.textContent('#tiffinView')).replace(/\s+/g,' ');
  assert(/0 tiffins/.test(kt) && /1 skipped/.test(kt), 'kitchen: 0 tiffins, 1 skipped');
  // Closed meal is refused by the server
  await E(p, `settings.tiffinCutoff={lunch:"00:00",dinner:"00:00",breakfast:"00:00"}; tiffinSubs[0].start=fmtDate(new Date()); saveSettings(); saveTfSubs();`); await flush(p);
  const r = await C.evaluate(async (sid) => { const t = new Date(Date.now()+330*60000).toISOString().slice(0,10); const x = await fetch('/api/cust/tiffin', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ subId:sid, date:t, meal:'lunch', skip:true }) }); return x.status; }, await E(p, 'tiffinSubs[0].id'));
  assert(r===409, 'after the cutoff the server refuses changes (409)');
  const bad = await C.evaluate(async () => { const x = await fetch('/api/cust/tiffin', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ subId:'nope', date:'2099-01-01', meal:'lunch' }) }); return x.status; });
  assert(bad===400 || bad===404, 'someone else\'s / unknown tiffin refused');
  // Meals left: skipped and paused days are not counted
  const left = await E(p, `(function(){ var T = fmtDate(new Date()); var s = { id:'x1', name:'A', start:addDays(T,-4), meals:['lunch'], offDays:[], mealsTotal:5, pauses:[{from:addDays(T,-2),to:addDays(T,-2)}], status:'active' };
    tiffinSubs.push(s); tiffinPicks.push({ id:'x1|'+addDays(T,-3)+'|lunch', subId:'x1', date:addDays(T,-3), meal:'lunch', skip:true });
    var a = tfLeft(s); s.mealsTotal = 3; var b = tfLeft(s); return a+","+b; })()`);
  assert(left==='2,0', 'meals left: 5 bought − 3 served (1 skipped, 1 paused) = 2; with 3 bought = 0 (finished): '+left);
  // Renew a finished plan: restarts from the next meal, no back-counting
  await E(p, `renderAll(); openTfSub('x1')`); await p.click('#tsd_renew'); await p.fill('#trn_cnt', '4'); await p.fill('#trn_amt', '400'); await p.click('#trn_ok'); await p.waitForTimeout(100);
  assert(await E(p, `tfLeft(tiffinSubs.find(function(s){ return s.id==="x1"; }))`)===4 && await E(p, `sales.filter(function(s){ return s.tiffin==="x1"; }).length`)===1, 'renewal: 4 tiffins left, payment recorded');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
