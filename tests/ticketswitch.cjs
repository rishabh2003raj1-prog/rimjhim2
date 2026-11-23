// A live dine-in order loaded for billing must not lock Takeaway / Delivery.
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
  const dis = () => p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  await E(p, `menuItems=[{id:'chai',name:'Masala Chai',category:'Tea',price:20,active:true},{id:'sam',name:'Samosa',category:'Snacks',price:15,active:true}]; liveOrders=[]; saveMenu(); saveLive(); counterType='dine'; renderAll(); showView('counter');`);
  const on = () => p.$eval('.ctype button.on', x => x.getAttribute('data-ctype'));
  // Table 1: send to kitchen, served, then Make bill -> loaded into the Counter
  await p.click('[data-table="Table 1"]'); await p.click('.ctile[data-add="chai"]'); await p.click('#ct_go'); await p.waitForTimeout(200); await dis();
  await E(p, `var t = liveOrders[0]; t.status = 'served'; saveLive(); ticketAdvance(t.id);`); await p.waitForTimeout(300);
  assert(await E(p, 'counterTicket') === (await E(p, 'liveOrders[0].id')), 'Make bill loads Table 1 into the Counter');
  await E(p, 'closeForm()'); await p.waitForTimeout(150);   // guest not ready to pay
  assert(await p.$('.ctbilling #ct_unbill'), 'clear "Billing Table 1 · ✕ Stop" bar');
  await p.screenshot({ path: process.env.S+'/ticketswitch.png' });
  await p.click('[data-ctype="take"]'); await p.waitForTimeout(150);
  assert(await on()==='take' && await E(p, 'counterTicket')===null && Object.keys(await E(p, 'counterOrder')).length===0, 'Takeaway works while Table 1 is live (empty new order)');
  assert(await E(p, 'liveOrders.length===1 && !liveOrders[0].paid && liveOrders[0].status==="served"'), 'Table 1 order still open in Live orders');
  await p.click('.ctile[data-add="sam"]'); await p.click('#ct_go'); await p.waitForTimeout(200);
  assert(await p.isVisible('#sheetBg.on'), 'takeaway goes on to payment');
  await E(p, 'closeForm()');
  await p.click('[data-ctype="delivery"]'); await p.waitForTimeout(150);
  assert(await on()==='delivery', 'Delivery works too');
  // Stop button releases
  await E(p, `ticketAdvance(liveOrders[0].id);`); await p.waitForTimeout(200); await E(p, 'closeForm()');
  await p.click('#ct_unbill'); await p.waitForTimeout(150);
  assert(await E(p, 'counterTicket')===null && await p.$('[data-table="Table 1"].busy'), '✕ Stop lets go; Table 1 still shows busy');
  // order paid / cancelled on another phone -> Counter is not stuck
  await E(p, `ticketAdvance(liveOrders[0].id);`); await p.waitForTimeout(200); await E(p, 'closeForm()');
  await E(p, `liveOrders[0].status='cancelled'; renderCounter();`);
  assert(await E(p, 'counterTicket')===null && !(await p.$('.ctbilling')), 'order cancelled elsewhere: Counter released');
  await p.click('[data-ctype="take"]'); assert(await on()==='take', 'switching still works');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
