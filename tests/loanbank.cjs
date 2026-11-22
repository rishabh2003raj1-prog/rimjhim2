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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); purchases=[]; expenses=[]; creditPayments=[]; cashDays=[]; cashMoves=[];
    settings.bankBalance=10000; settings.bankDate='2026-11-01'; saveSettings();
    sales=[{id:'u1',date:'2026-11-12',customer:'W',amount:2000,mode:'UPI'}];
    investments=[{id:'l1',date:'2026-11-12',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:25000,mode:'Bank Transfer',via:'bank'},
                 {id:'c1',date:'2026-11-12',partner:'Dashrath Bhaiya',invType:'Investment',purpose:'Equipment / furniture',amount:8000,mode:'UPI',via:'bank'},
                 {id:'s1',date:'2026-11-12',partner:'Dashrath Bhaiya',invType:'Investment',purpose:'Shop purchase',amount:300000,mode:'Bank Transfer',via:'direct'},
                 {id:'l0',date:'2026-10-01',partner:'Dashrath Bhaiya',invType:'Loan',purpose:'Working capital',amount:10000,mode:'UPI',via:'direct'},
                 {id:'r1',date:'2026-11-12',partner:'Dashrath Bhaiya',invType:'Loan repayment',purpose:'Working capital',amount:4000,mode:'UPI',via:'bank'}];
    saveEverything(); renderAll(); openCalendarOn('2026-11-12');`);
  await p.waitForTimeout(400);
  const card = (await p.evaluate(() => [...document.querySelectorAll('#dayPanel .cashday')][1].innerText)).replace(/\s+/g,' ');
  console.log('   card: ' + card);
  assert(/\+ Loan from Rishabh ?₹25,000/.test(card), 'loan money entry shown: + Loan from Rishabh');
  assert(/\+ Capital from Dashrath Bhaiya ?₹8,000/.test(card) && !/3,00,000/.test(card), 'capital into bank shown; directly-paid shop purchase not in the bank');
  assert(/Loan repaid to Dashrath Bhaiya( \(paid from bank\))? ?₹4,000/.test(card), 'loan repaid shown in paid from bank');
  assert(/Should be in bank ?₹41,000/.test(card), 'should be in bank = 10,000 + 2,000 + 25,000 + 8,000 - 4,000');
  await p.click('#dp_bank'); await p.waitForTimeout(200);
  const form = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Loan from Rishabh ?₹25,000/.test(form) && /Loan repaid to Dashrath Bhaiya( \(paid from bank\))? ?₹4,000/.test(form), 'record form shows the same loan lines');
  await E(p, 'closeForm()');
  // bank tab summary + cash tab
  await E(p, `showView('records'); switchRecordsSub('bank'); bkMonth='2026-11'; renderBankView();`);
  const t = (await p.textContent('#bankView')).replace(/\s+/g,' ');
  assert(/\+ Loans from partners ?₹25,000/.test(t) && /\+ Partner capital in ?₹8,000/.test(t) && /− Loans repaid to partners ?₹4,000/.test(t), 'Bank tab summary separates loans, capital and repayments');
  assert(/Loan from Rishabh \(working capital\)/.test(t), 'Bank tab entry names the loan');
  await E(p, `switchRecordsSub('cash')`);
  const c = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  assert(/Loans from partners ?₹25,000/.test(c) && /Loans repaid to partners ?₹4,000/.test(c), 'Cash tab bank lines show loans');
  const R = JSON.parse(await E(p, `JSON.stringify(cashReview('2026-11'))`));
  assert(Math.abs(R.extTotal - R.change) < 0.01 && R.ext.pLoan === 25000 && R.ext.pRepay === -4000, 'cash review still balances');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
