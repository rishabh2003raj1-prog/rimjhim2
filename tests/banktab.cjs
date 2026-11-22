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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners();
    settings.bankBalance=50000; settings.bankDate='2026-10-10'; settings.openingCash=0; settings.openingCashDate='2026-09-01'; saveSettings();
    sales=[{id:'s0',date:'2026-09-20',customer:'W',amount:4000,mode:'UPI'},
           {id:'s1',date:'2026-10-11',customer:'W',amount:3000,mode:'UPI'},{id:'s2',date:'2026-10-11',customer:'W',amount:500,mode:'Card'},
           {id:'s3',date:'2026-10-12',customer:'W',amount:2000,mode:'UPI'}];
    creditPayments=[]; investments=[]; purchases=[]; cashDays=[];
    expenses=[{id:'e0',date:'2026-09-25',category:'Rent',description:'Rent - September 2026',amount:30000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'},
              {id:'e1',date:'2026-10-15',category:'Rent',description:'Rent - October 2026',amount:30000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'},
              {id:'e2',date:'2026-10-16',category:'Electricity',amount:1500,mode:'UPI',paidBy:'Cafe UPI/bank'}];
    cashMoves=[]; saveSales(); saveExpense(); saveCashMoves(); renderAll();
    showView('records'); switchRecordsSub('bank'); bkMonth='2026-10'; renderBankView();`);
  let t = (await p.textContent('#bankView')).replace(/\s+/g,' ');
  assert(/Balance at the start of the month ?₹50,000/.test(t), 'Oct opens at 50,000 (noted on 10 Oct, nothing between 1 and 10 Oct)');
  assert(/UPI \/ card sales ?₹5,500/.test(t) && /Bills paid ?₹31,500/.test(t) && /end of the month ?₹24,000/.test(t), 'Oct: +5,500 sales, -31,500 bills = 24,000');
  assert(/Rent ?₹30,000/.test(t) && /Electricity ?₹1,500/.test(t), 'spending by category');
  await E(p, `bkMonth='2026-09'; renderBankView();`);
  t = (await p.textContent('#bankView')).replace(/\s+/g,' ');
  console.log('   Sep: ' + t.slice(t.indexOf('Summary'), t.indexOf('Summary')+260));
  assert(/end of the month ?₹50,000/.test(t) && /start of the month ?₹76,000/.test(t), 'Sep worked backwards: 50,000 + 30,000 rent - 4,000 sales = 76,000 at start');
  await E(p, `bkMonth='2026-10'; renderBankView();`);
  // cash withdrawn into counter
  await p.click('#bk_atm'); await p.fill('#ba_amt2','2000'); await p.fill('#ba_date','2026-10-20'); await p.fill('#ba_note','ATM'); await p.click('#ba_save2'); await p.waitForTimeout(200);
  assert(await E(p, `cashMovement('2026-10-20').inflow`) === 2000, 'withdrawal into counter raises counter cash');
  // withdrawn and kept by Rishabh
  await p.click('#bk_atm'); await p.selectOption('#ba_to','Rishabh'); await p.fill('#ba_amt2','1000'); await p.fill('#ba_date','2026-10-21'); await p.click('#ba_save2'); await p.waitForTimeout(200);
  const R = JSON.parse(await E(p, `JSON.stringify(handoverLedger('2026-10'))`)).find(r=>r.holder==='Rishabh');
  assert(R.fromBank === 1000 && R.closing === 1000, 'withdrawal kept by Rishabh shows in his handover');
  // adjustment requires a note
  await p.click('#bk_adj'); await p.selectOption('#ba_dir','in'); await p.fill('#ba_amt2','250'); await p.click('#ba_save2'); await p.waitForTimeout(150);
  assert(/Add a note/.test(await p.textContent('#ba_err2')), 'adjustment needs a note');
  await p.fill('#ba_note','Vendor refund'); await p.fill('#ba_date','2026-10-22'); await p.click('#ba_save2'); await p.waitForTimeout(200);
  await p.click('#bk_adj'); await p.selectOption('#ba_dir','out'); await p.fill('#ba_amt2','100'); await p.fill('#ba_note','Statement correction'); await p.fill('#ba_date','2026-10-23'); await p.click('#ba_save2'); await p.waitForTimeout(200);
  t = (await p.textContent('#bankView')).replace(/\s+/g,' ');
  assert(/end of the month ?₹21,150/.test(t), 'Oct end 24,000 - 2,000 - 1,000 + 250 - 100 = 21,150');
  assert(await E(p, 'bankBalanceNow()') === 21150, 'bank now matches the tab (Cash tab / dashboard)');
  // running balance on entries + edit
  assert(/bal ₹21,150/.test(t), 'entries show running balance');
  await p.click('[data-bkk="adj"]'); await p.waitForTimeout(150);
  assert(await p.inputValue('#ba_amt2') === '100', 'tap adjustment to edit (newest first)');
  await p.click('#ba_cancel2');
  // review
  await p.click('#bk_rev'); await p.waitForTimeout(150);
  assert(/Reviewed on/.test(await p.textContent('#bankView')), 'month marked reviewed');
  // tapping UPI sales opens that calendar day
  await p.click('[data-bkk="sales"]'); await p.waitForTimeout(200);
  assert(await p.textContent('#calTitle') === 'October 2026', 'UPI sales row opens the calendar day');
  // profit unaffected by adjustments/withdrawals
  await E(p, `customFrom='2026-10-01'; customTo='2026-10-31'; renderDashboard();`);
  assert(await p.textContent('#kpiExp') === '₹31,500', 'adjustments do not change expenses/profit');
  await p.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  const p2 = await open(b, errs);
  assert(await E(p2, 'bankBalanceNow()') === 21150 && await E(p2, `!!settings.bankReviewed['2026-10']`), 'other phone sees the same');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
