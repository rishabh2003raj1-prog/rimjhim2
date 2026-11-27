// Bill PDF for the customer: cafe name / address / phone / GSTIN from settings, customer name and phone, items, total.
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
  await E(p, `menuItems=[{id:'chai',name:'Masala Chai',category:'Tea',price:20,active:true},{id:'par',name:'Egg Paratha',category:'Paratha',price:89,active:true}]; sales=[]; liveOrders=[]; settings.billInfo=null; saveMenu(); saveSales(); saveLive(); saveSettings(); setCounterType('take'); renderAll(); showView('counter');`);
  await p.click('.ctile[data-add="par"]'); await p.click('.ctile[data-add="chai"]'); await p.click('.ctile[data-add="chai"]');
  await p.click('#ct_go'); await p.click('[data-pay="upi"]'); await p.click('#pp_done').catch(()=>{}); await p.waitForTimeout(200);
  await p.waitForSelector('#pd_pdf'); await p.click('#pd_pdf');
  assert(await p.isVisible('#bp_ca'), 'first time: asks for the cafe address');
  await p.fill('#bp_cn', 'Test Cafe'); await p.fill('#bp_ca', 'Shop 4, Main Market, Sector 9, Testpur, 110001'); await p.fill('#bp_cp', '98100 00000'); await p.fill('#bp_cg', '09abcde1234f1z5');
  await p.fill('#bp_name', 'Anita Sharma'); await p.fill('#bp_phone', '98111 22233');
  await p.screenshot({ path: process.env.S+'/billpdf_form.png' });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout:15000 }).catch(()=>null), p.click('#bp_go')]);
  assert(dl && /^Test_Cafe_Bill_\d{4}-\d\d-\d\d_1\.pdf$/.test(dl.suggestedFilename()), 'PDF made: '+(dl && dl.suggestedFilename()));
  await dl.saveAs(process.env.S+'/bill_sample.pdf'); const buf = fs.readFileSync(process.env.S+'/bill_sample.pdf'), txt = buf.toString('latin1');
  for (const w of ['Test Cafe', 'Shop 4, Main Market, Sector 9, Testpur, 110001', 'GSTIN: 09ABCDE1234F1Z5', 'Customer: Anita Sharma', 'Phone: 9811122233', 'Egg Paratha', 'Masala Chai', 'TOTAL', 'Rs. 129.00', 'Paid by: UPI'])
    assert(txt.includes(w), 'PDF has "'+w+'"');
  assert(await E(p, `JSON.stringify([settings.billInfo.address, sales[0].order.billTo.name])`)==='["Shop 4, Main Market, Sector 9, Testpur, 110001","Anita Sharma"]', 'cafe address saved for next time; customer name kept on the bill');
  // From Today's bills: address no longer asked, customer filled in
  await E(p, `closeForm(); openCounterBills(fmtDate(new Date()))`); await p.click('[data-billpdf]');
  assert(!(await p.isVisible('#bp_ca')) && await p.inputValue('#bp_name')==='Anita Sharma' && /Testpur/.test(await p.textContent('#sheet')), 'Today\'s bills → 📄 Bill PDF: cafe details remembered, customer filled');
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout:15000 }).catch(()=>null), p.click('#bp_go')]);
  assert(!!dl2, 'second PDF made');
  // Settings show the bill details
  await E(p, `closeForm(); openUpiSettings()`);
  assert(await p.inputValue('#up_bname')==='Test Cafe' && /Testpur/.test(await p.inputValue('#up_baddr')) && await p.inputValue('#up_bgst')==='09ABCDE1234F1Z5', 'Counter settings: Bill details editable');
  // Order type can be corrected on the bill
  await E(p, `closeForm(); openBillPdf(sales[0].id)`);
  assert(await p.inputValue('#bp_type')==='take', 'order type shown (takeaway)');
  await p.selectOption('#bp_type', 'dine');
  const [dl3] = await Promise.all([p.waitForEvent('download', { timeout:15000 }).catch(()=>null), p.click('#bp_go')]);
  await dl3.saveAs(process.env.S+'/bill_dine.pdf');
  assert(fs.readFileSync(process.env.S+'/bill_dine.pdf').toString('latin1').includes('Dine-in') && await E(p, 'sales[0].order.type')==='dine', 'changed to Dine-in: on the PDF and saved on the bill');
  // A counter (billing) login: the address it types is saved for every phone, and only once
  const call = (pg, m, u, bd) => pg.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [m, u, bd]);
  await E(p, `settings.billInfo = null; saveSettings(); scheduleFlush(0)`); await p.waitForFunction(() => window.__ev('Object.keys(cloud.dirty).length===0'), null, { timeout:20000 });
  assert((await call(p, 'POST', '/api/users', { login:'counter-1', outlet:'rimjhim', name:'Counter', access:'billing', password:'secret123' })).status===200, 'billing login made');
  const B = await (await b.newContext({ viewport:{width:400,height:850}, acceptDownloads:true })).newPage(); B.on('pageerror', e => errs.push('B: '+e.message));
  await B.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await B.goto('http://127.0.0.1:8787/'); await B.waitForSelector('#loginBg.on'); await B.fill('#loginId', 'counter-1'); await B.fill('#loginPin', 'secret123'); await B.click('#loginGo'); await B.waitForTimeout(2500);
  await B.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await E(B, `openBillPdf(sales[0].id)`); await B.waitForSelector('#bp_go');
  assert(await B.isVisible('#bp_ca'), 'counter login, no address yet: asked once');
  await B.fill('#bp_ca', 'Shop 4, Main Market, Sector 9, Testpur, 110001');
  const [dl4] = await Promise.all([B.waitForEvent('download', { timeout:15000 }).catch(()=>null), B.click('#bp_go')]);
  assert(!!dl4, 'PDF made from the counter login'); await B.waitForTimeout(1500);
  const srv = await call(p, 'GET', '/api/data?outlet=rimjhim');
  assert(((srv.json.items.settings_v1||{}).value||{}).billInfo && srv.json.items.settings_v1.value.billInfo.address==='Shop 4, Main Market, Sector 9, Testpur, 110001', 'address saved on the server for every phone');
  await E(B, `closeForm(); openBillPdf(sales[0].id)`); await B.waitForSelector('#bp_go');
  assert(!(await B.isVisible('#bp_ca')), 'next bill: address not asked again');
  const again = await call(B, 'POST', '/api/billinfo?outlet=rimjhim', { address:'Somewhere else' });
  assert(again.status===403, 'a counter login cannot overwrite the saved address');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
