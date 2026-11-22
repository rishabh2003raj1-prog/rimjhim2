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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners();
    settings.bankBalance=50000; settings.bankDate='2026-10-01'; settings.openingCash=1000; settings.openingCashDate='${T}'; saveSettings();
    sales=[]; creditPayments=[]; investments=[]; cashMoves=[]; purchases=[]; bills=[];
    cashDays=[{id:'c1',date:'2026-10-02',counted:5000,floatLeft:0,receivedBy:'Dashrath Bhaiya'}];
    expenses=[{id:'e1',date:'2026-10-05',category:'Rent',description:'Rent - October 2026',amount:30000,mode:'UPI',paidBy:'Rishabh (personal)'},
              {id:'e2',date:'2026-10-06',category:'Electricity',amount:1500,mode:'UPI',paidBy:'Rishabh (personal)'},
              {id:'e3',date:'2026-10-07',category:'Repairs',amount:400,mode:'Cash',paidBy:'Rishabh (personal)'},
              {id:'e4',date:'2026-10-08',category:'Repairs',amount:250,mode:'Cash',paidBy:'Dashrath Bhaiya (personal)'}];
    purchases=[{id:'p1',billId:'b1',date:'2026-10-09',vendor:'Kirana',item:'Milk',qty:10,unit:'L',rate:60,gst:0,mode:'Cash',paidBy:'Dashrath Bhaiya (personal)'}];
    saveCashDays(); saveExpense(); savePurch(); saveBills(); renderAll();`);
  assert(await E(p, `pendingReimbursements().length`) === 5, '5 items owed');
  await E(p, `openOwedSheet()`);
  // rent by bank
  await p.click('[data-settle="exp:e1"]'); await p.selectOption('#rp_mode','bank'); await p.fill('#rp_date','2026-10-20'); await p.click('#rp_go'); await p.waitForTimeout(200);
  let m = JSON.parse(await E(p, `JSON.stringify(bankMovements())`));
  assert(m.repaid === 30000 && await E(p, 'bankBalanceNow()') === 20000, 'rent repaid by UPI comes off bank (50,000 -> 20,000)');
  // electricity in cash from counter today
  await p.click('[data-settle="exp:e2"]'); await p.selectOption('#rp_mode','cash'); await p.click('#rp_go'); await p.waitForTimeout(200);
  assert(await E(p, `cashMovement('${T}').repaid`) === 1500 && await E(p, `expectedCash('${T}')`) === -1500, 'cash repayment comes out of today counter');
  // repairs from Dashrath's handover cash
  await p.click('[data-settle="exp:e3"]'); await p.selectOption('#rp_mode','held:Dashrath Bhaiya'); await p.fill('#rp_date','2026-10-21'); await p.click('#rp_go'); await p.waitForTimeout(200);
  const D = JSON.parse(await E(p, `JSON.stringify(handoverLedger('2026-10'))`)).find(r=>r.holder==='Dashrath Bhaiya');
  assert(D.repay === 400 && D.closing === 4600, 'repaid from Dashrath handover cash (5,000 -> 4,600)');
  // Dashrath's two items: repay all by bank
  assert(await p.$('[data-settleall="Dashrath Bhaiya"]') !== null, 'repay-all button for a partner with 2+ items');
  await p.click('[data-settleall="Dashrath Bhaiya"]');
  assert(/Repay Dashrath Bhaiya ₹850/.test(await p.textContent('#sheet h2')), 'repay all totals 250 + 600 = 850');
  await p.selectOption('#rp_mode','bank'); await p.fill('#rp_date','2026-10-22'); await p.click('#rp_go'); await p.waitForTimeout(200);
  assert(await E(p, `pendingReimbursements().length`) === 0, 'nothing owed now');
  assert(await E(p, 'bankBalanceNow()') === 19150, 'bank 20,000 - 850 = 19,150');
  await E(p, `showView('records'); switchRecordsSub('cash');`);
  assert(/Partners repaid by UPI \/ bank ?₹30,850/.test((await p.textContent('#cashView')).replace(/\s+/g,' ')), 'Cash tab shows partner repayments line');
  await E(p, `setAppMonth('2026-10'); recPeriod='month'; renderAll(); switchRecordsSub('expenses')`);
  const ex = await p.textContent('#expenseList');
  assert(/repaid by UPI\/bank/.test(ex) && /repaid in cash/.test(ex) && /repaid from handover cash/.test(ex), 'expenses show how each was repaid');
  // count as investment still works
  await E(p, `expenses.push({id:'e9',date:'2026-10-25',category:'Repairs',amount:999,mode:'UPI',paidBy:'Rishabh (personal)'}); saveExpense(); openOwedSheet();`);
  await p.click('[data-settle="exp:e9"]'); await p.selectOption('#rp_mode','invest'); await p.click('#rp_go'); await p.waitForTimeout(200);
  assert(await E(p, `investments.filter(function(v){return v.amount===999;}).length`) === 1 && await E(p, 'bankBalanceNow()') === 19150, 'count as investment adds capital, bank unchanged');
  // persists to server
  await p.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  const p2 = await open(b, errs);
  assert(await E(p2, 'bankBalanceNow()') === 19150 && await E(p2, 'pendingReimbursements().length') === 0, 'other phone sees the same');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
