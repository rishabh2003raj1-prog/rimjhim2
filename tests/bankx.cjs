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
  await E(p, `PARTNERS=['Rishabh']; savePartners(); sales=[]; expenses=[]; purchases=[]; investments=[]; cashMoves=[]; creditPayments=[];
    settings.bankBalance=10000; settings.bankDate='2026-10-01'; saveSettings(); saveExpense(); saveCashMoves(); renderAll();
    showView('records'); switchRecordsSub('cash');`);
  await p.click('#bk_int'); await p.fill('#in_amt','125.5'); await p.fill('#in_date','2026-10-31'); await p.fill('#in_note','Q3 interest'); await p.click('#in_save'); await p.waitForTimeout(200);
  assert(await E(p,'bankBalanceNow()') === 10125.5, 'interest adds to bank');
  await p.click('#bk_chg'); await p.waitForTimeout(150);
  assert(await p.inputValue('#f_expcat') === 'Bank charges' && await p.inputValue('#f_paidby') === 'Cafe UPI/bank' && await p.inputValue('#f_mode') === 'Bank Transfer', 'bank charge opens prefilled');
  await p.fill('#f_amount','59'); await p.fill('#f_desc','SMS charges'); await p.click('#f_save'); await p.waitForTimeout(200);
  const m = JSON.parse(await E(p,'JSON.stringify(bankMovements())'));
  assert(m.interest === 125.5 && m.charges === 59 && m.bills === 0 && await E(p,'bankBalanceNow()') === 10066.5, 'charge comes off bank, shown separately from bills');
  assert(await E(p, `cashMovement(fmtDate(new Date())).outExp`) === 0, 'bank charge not taken from the counter');
  const c = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  assert(/Interest received ?₹125\.5|Interest received ?₹126/.test(c) && /Bank charges ?₹59/.test(c) && /Q3 interest/.test(c) && /SMS charges/.test(c), 'Cash tab lists interest and charges');
  // edit interest, then delete it
  await p.click('[data-bke="interest"]'); await p.fill('#in_amt','130'); await p.click('#in_save'); await p.waitForTimeout(200);
  assert(await E(p,'bankBalanceNow()') === 10071, 'edited interest');
  await p.click('[data-bke="interest"]'); await p.click('#in_del'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(200);
  assert(await E(p,'bankBalanceNow()') === 9941, 'deleted interest');
  // bank charge counts as an expense in the dashboard
  assert(await E(p, `expenses.filter(function(x){return x.category==='Bank charges';}).length`) === 1, 'bank charge is an expense entry');
  assert(JSON.parse(await E(p, 'JSON.stringify(cashHolders())')).every(n => n), 'interest entries do not create a blank handover holder');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
