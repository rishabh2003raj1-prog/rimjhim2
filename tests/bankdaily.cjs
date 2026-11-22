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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); purchases=[]; investments=[]; creditPayments=[]; cashDays=[]; cashMoves=[];
    settings.bankBalance=50000; settings.bankDate='2026-11-01'; saveSettings();
    sales=[]; for(var d=1; d<=19; d++){ var ds='2026-11-'+String(d).padStart(2,'0'); sales.push({id:'u'+d,date:ds,customer:'W',amount:1000,mode:'UPI'}); }
    sales.push({id:'oct',date:'2026-10-20',customer:'W',amount:3000,mode:'UPI'});
    expenses=[{id:'e1',date:'2026-11-07',category:'Rent',description:'Rent - November 2026',amount:20000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'}];
    saveEverything(); renderAll();`);
  // calendar day panel for 5 Nov
  await E(p, `openCalendarOn('2026-11-05')`); await p.waitForTimeout(300);
  let t = (await p.textContent('#dayPanel')).replace(/\s+/g,' ');
  assert(/Should be in bank ?₹55,000/.test(t) && /Not checked yet/.test(t), '5 Nov: expected 50,000 + 5 days of UPI = 55,000');
  await p.click('#dp_bank'); await p.fill('#bc_amt','55000'); await p.waitForTimeout(100);
  assert(/Tallies/.test(await p.textContent('#bc_diff')), 'form says it tallies');
  await p.click('#bc_save'); await p.waitForTimeout(300);
  t = (await p.textContent('#dayPanel')).replace(/\s+/g,' ');
  assert(/Bank app showed ?₹55,000/.test(t) && /Difference ?Tallies/.test(t), 'day panel shows the check, tallies');
  assert(await p.evaluate(() => [...document.querySelectorAll('.daycell[data-date="2026-11-05"] .dots i')].some(i => i.style.background.includes('43, 108, 176') || i.getAttribute('style').includes('#2B6CB0'))), 'calendar dot for the checked day');
  // 10 Nov: bank shows 500 less (expected 55,000 + 5,000 - 20,000 rent = 40,000)
  await E(p, `openCalendarOn('2026-11-10')`); await p.waitForTimeout(200);
  assert(/Should be in bank ?₹40,000/.test((await p.textContent('#dayPanel')).replace(/\s+/g,' ')), '10 Nov expected 40,000');
  await p.click('#dp_bank'); await p.fill('#bc_amt','39500'); await p.fill('#bc_note','charge?'); await p.click('#bc_save'); await p.waitForTimeout(300);
  console.log('   ' + await p.textContent('#dlgMsg')); await p.click('#dlgBtns button');
  t = (await p.textContent('#dayPanel')).replace(/\s+/g,' ');
  assert(/Difference ?-₹500 less/.test(t), '10 Nov: ₹500 less');
  // next days start from the real balance
  assert(await E(p, `bankBalanceAt('2026-11-12')`) === 39500 + 1000, '11 Nov end = 39,500 + 1,000 (starts from the check)');
  const now = await E(p, 'bankBalanceNow()'); console.log('   bank now', now);
  // month data identity + cash review
  const bd = JSON.parse(await E(p, `JSON.stringify(bankMonthData('2026-11'))`));
  const dec1 = await E(p, `bankBalanceAt('2026-12-01')`);
  console.log('   Nov opening', bd.opening, 'closing', bd.closing, 'Dec 1', dec1, 'checkOut', bd.tot.checkOut);
  assert(Math.abs(bd.closing - dec1) < 0.01 && bd.opening === 50000 && bd.tot.checkOut === 500, 'month balances: opening + entries + check difference = closing');
  const R = JSON.parse(await E(p, `JSON.stringify(cashReview('2026-11'))`));
  assert(Math.abs(R.extTotal - R.change) < 0.01 && R.ext.bankDiff === -500, 'cash review balances with the bank difference');
  const oct = JSON.parse(await E(p, `JSON.stringify(bankMonthData('2026-10'))`));
  assert(oct.closing === 50000 && oct.opening === 47000, 'October worked backwards from the noted balance');
  // bank tab list + tap to edit
  await E(p, `showView('records'); switchRecordsSub('bank'); bkMonth='2026-11'; renderBankView();`);
  t = (await p.textContent('#bankView')).replace(/\s+/g,' ');
  assert(/Daily bank balance checks/.test(t) && /10 Nov · ₹39,500/.test(t) && /5 Nov · ₹55,000 ?tallies/.test(t) && /Found lower at balance checks ?₹500/.test(t), 'Bank tab lists checks and the difference');
  await p.click('.psrow[data-bkk="check"]'); await p.waitForTimeout(150);
  assert(await p.inputValue('#bc_amt') === '39500', 'tap a check to edit it');
  await p.fill('#bc_amt','40000'); await p.click('#bc_save'); await p.waitForTimeout(300);
  assert(await E(p, `bankCheckResults()[bankCheckOn('2026-11-10').id].diff`) === 0, 'edited: now tallies');
  // delete a check
  await E(p, `openBankCheckForm('2026-11-05')`); await p.click('#bc_del'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(300);
  assert(!(await E(p, `!!bankCheckOn('2026-11-05')`)) && await E(p, `bankChecks().length`) === 1, 'check deleted');
  // statement PDF includes checks
  await E(p, `bkMonth='2026-11'; renderBankView();`);
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null); await p.click('#bk_pdf'); const d = await dl;
  if (d) { await d.saveAs(process.env.S + '/bankcheck.pdf'); }
  assert(!!d, 'bank statement PDF still generates');
  // Cash tab section + record today
  await E(p, `switchRecordsSub('cash')`);
  t = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  assert(/Last bank balance check \(10 Nov\) ?₹40,000/.test(t), 'Cash tab starts from the last check');
  await p.click('#cash_bankcheck'); await p.waitForTimeout(150);
  assert(await p.isVisible('#bc_amt'), 'Cash tab button opens today\'s check');
  await E(p, 'closeForm()');
  // sync to another phone
  await p.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  const p2 = await open(b, errs);
  assert(await E(p2, 'bankChecks().length') === 1 && Math.abs(await E(p2, 'bankBalanceNow()') - await E(p, 'bankBalanceNow()')) < 0.01, 'other phone sees the same checks and balance');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
