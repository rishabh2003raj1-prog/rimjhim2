// Rush hour mode: no order types / kitchen steps; Pay now with a token, or Pay later (open tokens billed at the end).
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
  await E(p, `menuItems=[{id:'chai',name:'Chai',category:'Tea',price:20,active:true},{id:'thali',name:'Veg Thali',category:'Thali',price:120,active:true}]; liveOrders=[]; sales=[]; saveMenu(); saveLive(); saveSales(); renderAll(); showView('counter');`);
  await p.click('#ct_rush'); await dis();
  assert(await E(p, 'rushOn()') && !(await p.$('.ctype')) && await p.$('.rushbar'), 'Rush hour ON: no order types or tables, a rush bar instead');
  // Pay now
  await p.click('.ctile[data-add="chai"]'); await p.click('.ctile[data-add="chai"]');
  assert(/Pay now/.test(await p.textContent('#ct_go')) && /Pay later/.test(await p.textContent('#ct_later')), 'bottom bar: ⏸️ Pay later and 💳 Pay now');
  await p.click('#ct_go'); await p.click('[data-pay="cash"]'); await p.click('#pp_done'); await p.waitForTimeout(150);
  assert(/Token 1/.test(await p.textContent('.pdone')), 'paid: big Token 1');
  assert(await E(p, `liveOrders.length===0 && sales.length===1 && sales[0].order.rush===true && sales[0].amount===40`), 'bill saved, no kitchen ticket made');
  assert(await E(p, 'sales[0].order.type')==='dine' && /^Dine-in · Bill/.test(await E(p, 'sales[0].desc')), 'rush bill is Dine-in by default');
  await E(p, 'closeForm()');
  await p.click('[data-rtype="take"]'); await p.click('.ctile[data-add="chai"]'); await p.click('#ct_go'); await p.click('[data-pay="cash"]'); await p.click('#pp_done'); await p.waitForTimeout(150);
  assert(await E(p, 'sales[1].order.type')==='take', 'switch to 🛍️ Takeaway: next bill is Takeaway');
  await E(p, 'closeForm(); sales = sales.slice(0,1); saveSales();'); await p.click('[data-rtype="dine"]');
  // Pay later: two customers
  await p.click('.ctile[data-add="thali"]'); await p.click('#ct_later'); await p.waitForTimeout(100);
  assert(/Token 2/.test(await p.textContent('.pdone')) && /pay later/.test(await p.textContent('.pdone')), 'pay later: Token 2 (one sequence with Pay now)');
  await p.fill('#tb_lbl', 'Table 4'); await p.click('#tb_ok'); await p.waitForTimeout(100);
  await p.click('.ctile[data-add="chai"]'); await p.click('#ct_later'); await p.waitForTimeout(100); await p.click('#tb_ok');
  let chips = await p.$$eval('[data-tab]', a => a.map(x => x.textContent.replace(/\s+/g,' ')));
  console.log('   '+JSON.stringify(chips));
  assert(chips.length===2 && /Token 2.*Table 4.*₹120/.test(chips[0]) && /Token 3.*₹20/.test(chips[1]), 'open tokens shown at the top');
  assert(await E(p, 'activeTickets().length')===0, 'open tokens never show in the kitchen');
  await p.screenshot({ path: process.env.S+'/rush_tabs.png' });
  // Token 1 orders more, then pays at the end
  await p.click('[data-tab]:first-child'); await p.waitForSelector('#pp_back'); await p.click('#pp_back');
  await p.click('.ctile[data-add="chai"]'); await p.click('#ct_later'); await p.waitForTimeout(100);
  assert(/Updated/.test(await p.textContent('.pdone')), 'more items added to Token 2'); await p.click('#tb_ok');
  assert(await E(p, `openTabs()[0].amount`)===140, 'Token 2 now ₹140');
  await p.click('[data-tab]:first-child'); await p.waitForSelector('[data-pay="upi"]');
  assert(/140/.test(await p.textContent('.ptotal')), 'bill shows ₹140');
  await p.click('[data-pay="upi"]'); await p.click('#pp_done'); await p.waitForTimeout(150);
  assert(/Token 2/.test(await p.textContent('.pdone')), 'paid screen shows Token 2');
  await E(p, 'closeForm()');
  assert(await E(p, `openTabs().length===1 && sales.length===2 && sales[1].order.token===2 && sales[1].mode==="UPI" && sales[1].amount===140`), 'Token 2 billed (UPI ₹140) and closed; Token 3 still open');
  await p.screenshot({ path: process.env.S+'/rush_paid.png' });
  // Cancel Token 3 (customer left) from the bill sheet
  await p.click('[data-tab]:first-child'); await p.waitForSelector('#pp_tabcx');
  await p.screenshot({ path: process.env.S+'/rush_cancelbtn.png' });
  await p.click('#pp_tabcx'); await p.waitForTimeout(100);
  const opts = await p.$$eval('#dlgBtns button', a => a.map(x => x.textContent));
  assert(opts.length===3 && /Customer left/.test(opts[0]) && /Keep/.test(opts[2]), 'cancel asks why (customer left / wrong token / keep)');
  await p.click('#dlgBtns button:last-child'); await p.waitForTimeout(100);
  assert(await E(p, 'openTabs().length')===1, 'Keep the token: still open');
  await p.click('#pp_back'); await p.waitForSelector('#ct_tabcx');
  await p.click('#ct_tabcx'); await p.waitForTimeout(100); await p.click('#dlgBtns button:first-child'); await p.waitForTimeout(150);
  assert(await E(p, `openTabs().length===0 && sales.length===2 && counterTicket===null && Object.keys(counterOrder).length===0`), 'token cancelled: no bill made, counter cleared');
  assert(await E(p, `checks.some(function(c){ return c.kind==="tokenvoid" && c.token===3 && c.why==="Customer left" && c.amount===20; })`), 'cancel kept as a record (who, why, amount)');
  assert(!(await p.$('[data-tab]')), 'token chip gone');
  await p.click('#ct_bills'); await p.waitForTimeout(150);
  assert(/Token 3 cancelled[\s\S]*Owner[\s\S]*Customer left[\s\S]*₹20/.test(await p.textContent('#sheet')), "Today's bills lists the cancelled token");
  await p.screenshot({ path: process.env.S+'/rush_cancel.png' });
  await E(p, 'closeForm()');
  await p.click('.ctile[data-add="chai"]'); await p.click('#ct_later'); await p.waitForTimeout(100);
  assert(/Token 4/.test(await p.textContent('.pdone')), 'cancelled number is not reused (next is Token 4)'); await p.click('#tb_ok');
  // Off again
  await p.click('#ct_rush');
  assert(!(await E(p, 'rushOn()')) && await p.$('.ctype'), 'Rush hour OFF: order types back');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
