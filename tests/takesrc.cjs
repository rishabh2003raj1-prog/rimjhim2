// Takeaway details: Customer / Zomato / Swiggy under Takeaway, each with its own switch.
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
  await E(p, `menuItems=[{id:'chai',name:'Chai',category:'Tea',price:20,active:true},{id:'momo',name:'Veg Momos',category:'Momos',price:60,active:true}]; liveOrders=[]; sales=[]; settings.takeawaySrc=null; saveMenu(); saveLive(); saveSales(); saveSettings(); setCounterType('take'); renderAll(); showView('counter');`);
  assert(!(await p.$('.tsrc')), 'all switches off: plain takeaway, no choices');
  // Turn on Customer + Zomato in Counter settings
  await E(p, 'openUpiSettings()');
  await p.check('#up_ts_customer'); await p.check('#up_ts_zomato'); await p.fill('#up_pc_zomato', '20'); await p.click('#up_save'); await p.waitForTimeout(150);
  assert(await E(p, `settings.takeawaySrc.customer===true && settings.takeawaySrc.zomato===true && settings.takeawaySrc.swiggy===false && settings.platforms.zomato.commission===20`), 'switches saved per outlet');
  const src = await p.$$eval('.tsrc button', a => a.map(x => x.textContent.trim()));
  assert(JSON.stringify(src)==='["🛍️ Counter","🧍 Customer","🔴 Zomato"]', 'Takeaway shows Counter / Customer / Zomato (Swiggy off): '+JSON.stringify(src));
  const top = await p.$$eval('.ctype button', a => a.map(x => x.getAttribute('data-ctype')));
  assert(JSON.stringify(top)==='["dine","take","delivery"]', 'top row unchanged');
  // Customer
  await p.click('[data-tsrc="customer"]'); await p.fill('#ct_cname', 'Ramesh'); await p.fill('#ct_cphone', '98765 43210');
  await p.click('.ctile[data-add="chai"]');
  assert(await p.inputValue('#ct_cname')==='Ramesh', 'name stays while adding items');
  await p.click('#ct_go'); await p.click('[data-pay="cash"]'); await p.click('#pp_done'); await p.waitForTimeout(150); await E(p, 'closeForm()');
  assert(await E(p, `sales[0].customer==="Ramesh" && sales[0].order.phone==="9876543210" && sales[0].order.src==="customer" && sales[0].order.type==="take" && liveOrders[0].cname==="Ramesh"`), 'customer takeaway: name + phone on the bill and the ticket');
  // Zomato
  await p.click('.tsrc [data-ctype="zomato"]');
  assert(await E(p, 'counterType')==='zomato' && await p.$('.ctype button.take.on'), 'Zomato is chosen under Takeaway (Takeaway stays lit)');
  await p.click('.ctile[data-add="momo"]'); await p.click('#ct_go'); await p.fill('#pf_id', '7781'); await p.click('#pf_ok'); await p.waitForTimeout(150); await E(p, 'closeForm()');
  assert(await E(p, `sales[1].order.platform==="zomato" && sales[1].order.pid==="7781" && sales[1].order.commission===12 && sales[1].amount===48`), 'Zomato order: ID, 20% commission, payout ₹48');
  await p.click('[data-tsrc="walk"]'); assert(await E(p, 'counterType')==='take' && !(await p.$('#ct_cname')), 'back to plain counter takeaway');
  await p.screenshot({ path: process.env.S+'/takesrc.png' });
  // Switch Zomato off → disappears; a phone left on Zomato falls back to takeaway
  await E(p, `setCounterType('zomato'); settings.takeawaySrc.zomato=false; renderAll();`);
  assert(await E(p, 'counterType')==='take' && !(await p.$('.tsrc [data-ctype="zomato"]')), 'switch off: Zomato gone, counter back on takeaway');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
