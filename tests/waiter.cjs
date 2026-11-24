// Waiter alerts: kitchen marks Ready -> waiter phone alerted to serve; bill paid -> alerted to clear the table.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
async function open(b, errs, id, pw){ const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  await p.addInitScript(() => { window.__said = []; Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:{ speak:(u)=>window.__said.push(u.text), cancel:()=>{} } }); window.SpeechSynthesisUtterance = function(t){ this.text = t; }; });
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); if(id) await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(2000); return p; }
const until = async (p, code, ms) => { for (let i = 0; i < (ms||15000)/500; i++) { if (await E(p, code)) return true; await p.waitForTimeout(500); } return false; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const K = await open(b, errs, '', '1234');   // counter / kitchen phone (owner)
  await E(K, `menuItems=[{id:'chai',name:'Masala Chai',category:'Tea',price:20,active:true},{id:'sam',name:'Samosa',category:'Snacks',price:15,active:true}]; liveOrders=[]; settings.tables=['Table 1','Table 2','Outside 1']; saveMenu(); saveLive(); saveSettings(); renderAll();`);
  await call(K, 'POST', '/api/users', { login:'waiter-1', outlet:'rimjhim', name:'Raju', access:'billing', password:'secret123' });
  await K.waitForTimeout(2500);
  const W = await open(b, errs, 'waiter-1', 'secret123');   // waiter phone
  await E(W, `showView('counter'); renderAll();`);
  await W.click('#ct_waiter'); await W.waitForSelector('#wt_sheet');
  await W.click('[data-wm="all"]'); await E(W, 'closeForm()');
  assert(await E(W, 'waiterMode()')==='all' && /🔔/.test(await W.textContent('#ct_waiter')), 'waiter alerts switched on for this phone');
  // Counter: dine-in order to Table 1, kitchen marks it ready
  await E(K, `showView('counter'); counterType='dine'; renderCounter();`);
  await K.click('[data-table="Table 1"]'); await K.click('.ctile[data-add="chai"]'); await K.click('.ctile[data-add="sam"]'); await K.click('#ct_go'); await K.waitForTimeout(200);
  await K.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  await E(K, `var t = liveOrders[0]; while(t.status!=="ready"){ var st = ticketStep(t); t.status = st.next; tLog(t, st.next); if(st.next==="ready") t.readyAt = Date.now(); } saveLive(); renderAll();`);
  // Waiter phone hears about it
  assert(await until(W, `!!document.getElementById('waiterBar')`), 'waiter phone shows the banner within seconds');
  assert(/Table 1/.test(await W.textContent('#waiterBar')) && /serve/.test(await W.textContent('#waiterBar')), 'banner: Table 1 ready — serve');
  assert(await E(W, `__said.some(function(s){ return /टेबल 1 का खाना तैयार है/.test(s); })`), 'Hindi voice: "टेबल 1 का खाना तैयार है, ले जाएँ"');
  await W.screenshot({ path: process.env.S+'/waiter_bar.png' });
  await W.click('#waiterBar'); await W.waitForSelector('#wt_sheet');
  assert(/Pick up & serve/.test(await W.textContent('#sheet')) && /Masala Chai/.test(await W.textContent('#sheet')), 'waiter screen lists the food to take');
  await W.screenshot({ path: process.env.S+'/waiter_sheet.png' });
  await W.click('[data-wdo][data-k="serve"]'); await W.waitForTimeout(200);
  assert(await E(W, `liveOrders[0].status==="served" && liveOrders[0].servedBy==="Raju"`), '✔ Served marks it served by the waiter');
  assert(!(await W.$('#waiterBar')), 'banner gone when nothing is waiting');
  // Bill paid at the counter -> clear table
  assert(await until(K, `liveOrders[0] && liveOrders[0].status==="served"`), 'counter phone sees it was served');
  await E(K, `var t = liveOrders[0]; t.paid = true; t.paidAt = Date.now(); tLog(t, "paid"); saveLive(); renderAll();`);
  assert(await until(W, `!!document.getElementById('waiterBar') && /Clear/.test(document.getElementById('waiterBar').textContent)`), 'after payment the waiter is told to clear Table 1');
  assert(await E(W, `__said.some(function(s){ return /टेबल 1 साफ़ करें/.test(s); })`), 'Hindi voice: "टेबल 1 साफ़ करें"');
  assert(await W.isVisible('#wt_sheet') && /Clear the table/.test(await W.textContent('#sheet')), 'the open waiter screen updated by itself with the clear-table job');
  await W.click('[data-wdo][data-k="clear"]'); await W.waitForTimeout(200);
  assert(await E(W, `liveOrders[0].status==="done"`), '✔ Table cleared finishes the order');
  assert(await until(K, `!openTicketFor('Table 1')`), 'Table 1 is free again on the counter');
  // Outdoor-only waiter does not get indoor tables
  await E(W, `setWaiterMode('out'); closeForm();`);
  const before = await E(W, '__waiterAlerts.length');
  await E(K, `createTicket({ type:'dine', table:'Table 2', items:[{menuId:'chai',name:'Masala Chai',qty:1,price:20}] }); var t2 = liveOrders.find(function(x){ return x.table==='Table 2' && x.status!=='done'; }); t2.status='ready'; t2.readyAt=Date.now();
    createTicket({ type:'dine', table:'Outside 1', items:[{menuId:'sam',name:'Samosa',qty:2,price:15}] }); var t3 = liveOrders.find(function(x){ return x.table==='Outside 1' && x.status!=='done'; }); t3.status='ready'; t3.readyAt=Date.now(); saveLive(); renderAll();`);
  assert(await until(W, `__waiterAlerts.length > ${before}`), 'outdoor waiter alerted');
  const keys = await E(W, `__waiterAlerts.slice(${before}).map(function(k){ var t = liveOrders.find(function(x){ return k.indexOf(x.id)===0; }); return t ? t.table : k; }).join(',')`);
  assert(keys==='Outside 1', 'only the outdoor table, not Table 2: '+keys);
  // Self-service outlet: owner switches waiter service off in Counter settings
  await E(K, `closeForm(); showView('counter'); renderCounter();`);
  await K.click('#ct_upi'); await K.selectOption('#up_waiter', 'off'); await K.click('#up_save'); await K.waitForTimeout(300);
  assert(await E(K, 'settings.waiterService===false'), 'owner turned waiter service off');
  assert(await until(W, `settings.waiterService===false`), 'waiter phone gets the setting');
  await E(W, `closeForm(); renderAll();`);
  assert(!(await W.$('#ct_waiter')) && !(await W.$('#waiterBar')), 'self service: no Waiter button and no banner');
  const n0 = await E(W, '__waiterAlerts.length');
  await E(K, `createTicket({ type:'dine', table:'Outside 1', items:[{menuId:'chai',name:'Masala Chai',qty:1,price:20}] }); var t4 = liveOrders[liveOrders.length-1]; t4.status='ready'; t4.readyAt=Date.now(); saveLive(); renderAll();`);
  await W.waitForTimeout(6000);
  assert(await E(W, '__waiterAlerts.length')===n0, 'self service: no waiter alerts');
  assert(await E(K, `/collect it at the counter/.test(ticketStep(liveOrders[liveOrders.length-1]).en)`), 'kitchen guide says call the customer to collect');
  await K.click('#ct_upi'); await K.selectOption('#up_waiter', 'on'); await K.click('#up_save'); await K.waitForTimeout(300);
  assert(await E(K, 'settings.waiterService===true') && await K.$('#ct_waiter'), 'switched back on: Waiter button returns');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
