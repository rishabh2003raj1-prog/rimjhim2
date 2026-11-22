const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const T = await E(p, 'fmtDate(new Date())');
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); bills=[]; cashDays=[{id:'k',date:'${T}',counted:500,floatLeft:0,receivedBy:'Dashrath Bhaiya'}];
    var mk = function(id, item, amt, mode, by, bill){ return {id:id, billId:bill||id, date:'${T}', vendor:'Rihan shop', item:item, qty:1, unit:'pcs', rate:amt, gst:0, mode:mode, paidBy:by}; };
    purchases=[mk('p1','disposable items',290,'Cash','Cafe cash'), mk('p2','Grocery items',260,'UPI','Cafe UPI/bank'),
               mk('p3','burger bun',180,'Cash','Rishabh (personal)'), mk('p4','iceberg lettuce',57,'Cash','Rishabh (personal)'),
               mk('p5','milk',248,'Credit','Cafe UPI/bank'), mk('p6','4 CP Thali',100,'Cash','Dashrath Bhaiya (cafe cash held)'),
               mk('p7','elaichi',60,'Cash','Dashrath Bhaiya (personal)')];
    saveEverything(); renderAll(); openCalendarOn('${T}');`);
  await p.waitForTimeout(400);
  const sum = (await p.$eval('#dayPanel .purchpay', e => e.innerText)).replace(/\s+/g,' ');
  console.log('   ' + sum);
  assert(/Cash from the counter ?₹290/.test(sum) && /UPI \(cafe account\) ?₹260/.test(sum) && /Udhaar \(vendor credit, not paid yet\) ?₹248/.test(sum), 'cash, UPI and vendor credit');
  assert(/Rishabh’s own money \(cafe owes Rishabh\) ?₹237/.test(sum) && /Dashrath Bhaiya’s own money \(cafe owes Dashrath Bhaiya\) ?₹60/.test(sum) && /Dashrath Bhaiya’s handover cash ?₹100/.test(sum), 'partner money with names, handover cash');
  const rows = (await p.textContent('#dayPanel')).replace(/\s+/g,' ');
  assert(/burger bun ?Rihan shop · 1 pcs ?Rishabh’s own money \(cafe owes Rishabh\) ?owed/.test(rows), 'each purchase shows how it was paid (+ owed tag)');
  // after repaying Rishabh, rows show "repaid"
  await E(p, `markSettled('p3', { mode:'bank', date:'${T}' })`); await p.waitForTimeout(300);
  assert(/burger bun ?Rihan shop · 1 pcs ?Rishabh’s own money \(cafe owes Rishabh\) ?repaid/.test((await p.textContent('#dayPanel')).replace(/\s+/g,' ')), 'repaid tag after settlement');
  // purchases list: month card + per-day summary
  await E(p, `showView('records'); switchRecordsSub('purchases');`); await p.waitForTimeout(300);
  const lt = (await p.textContent('#purchList')).replace(/\s+/g,' ');
  assert(/Paid how · /.test(lt) && /Cash from the counter ?₹290/.test(lt) && (lt.match(/Udhaar \(vendor credit/g)||[]).length >= 2, 'purchases tab: month card and day summary');
  await p.screenshot({ path: process.env.S + '/purchpay.png', fullPage: false });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
