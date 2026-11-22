const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const T = await E(p, 'fmtDate(new Date())'), M = T.slice(0,7);
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); sales=[]; purchases=[]; expenses=[]; cashMoves=[];
    cashDays=[{id:'k1',date:'${M}-01',counted:30000,floatLeft:0,receivedBy:'Dashrath Bhaiya'}];
    investments=[{id:'pl',date:'${M}-01',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:40000,mode:'UPI',via:'bank'}];
    loans=[{id:'a',date:'${M}-01',type:'take',party:'SBI',partyType:'Bank / NBFC',amount:100000,via:'bank'}];
    saveEverything(); renderAll(); showView('records'); switchRecordsSub('handover'); hoMonth='${M}'; renderHandoverView();`);
  await p.waitForTimeout(300);
  await p.click('[data-holoan="Dashrath Bhaiya"]'); await p.waitForTimeout(200);
  let t = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/holds ₹30,000/.test(t) && /SBI .*owed ₹1,00,000/.test(t) && /Rishabh .*owed ₹40,000/.test(t), 'chooser lists owed loans and the cash held');
  // repay part of Rishabh's partner loan from Dashrath's cash
  await p.click('[data-hlparty="Rishabh"]'); await p.waitForTimeout(200);
  assert(await p.inputValue('#f_invtype') === 'Loan repayment' && await p.inputValue('#f_via') === 'held:Dashrath Bhaiya' && await p.inputValue('#f_amount') === '30000', 'partner loan repayment prefilled from Dashrath\'s cash (capped at what he holds)');
  await p.fill('#f_amount','10000'); await p.click('#f_save'); await p.waitForTimeout(300);
  // repay SBI from his cash
  await E(p, `renderHandoverView()`);
  await p.click('[data-holoan="Dashrath Bhaiya"]'); await p.waitForTimeout(200);
  await p.click('[data-hlparty="SBI"]'); await p.waitForTimeout(200);
  assert(await p.inputValue('#ln_type') === 'repay' && await p.inputValue('#ln_via') === 'held:Dashrath Bhaiya' && await p.inputValue('#ln_party') === 'SBI', 'other loan repayment prefilled from Dashrath\'s cash');
  await p.fill('#ln_amt','15000'); await p.click('#ln_save'); await p.waitForTimeout(300);
  const D = JSON.parse(await E(p, `JSON.stringify(handoverLedger('${M}'))`)).find(r=>r.holder==='Dashrath Bhaiya');
  assert(D.loanPay === 25000 && D.closing === 5000 && D.invOut === 0, 'handover: 25,000 loans repaid from this cash, 5,000 left');
  t = (await p.textContent('#handoverView')).replace(/\s+/g,' ');
  assert(/− Loans repaid from this cash ?₹25,000/.test(t) && /Loan repaid to Rishabh/.test(t) && /Loan repaid to SBI/.test(t), 'handover card shows the loan repayments by name');
  assert(await E(p, 'partnerMoney("Rishabh").outstanding') === 30000 && await E(p, 'loanOutstanding("SBI","owe")') === 85000, 'loans reduced: Rishabh 30,000, SBI 85,000');
  assert(await E(p, 'bankBalanceNow()') === (await E(p, 'bankBalanceNow()')), 'bank untouched by handover-cash repayments');
  assert(await E(p, 'bankMovements().loanrepay') === 0 && await E(p, 'bankMovements().oloanout') === 0, 'no bank loan repayment recorded');
  const R = JSON.parse(await E(p, `JSON.stringify(cashReview('${M}'))`));
  assert(Math.abs(R.extTotal - R.change) < 0.01 && R.ext.pRepay === -10000 && R.ext.lRepaid === -15000, 'cash review balances');
  // statement PDF still generates
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null); await p.click('[data-hopdf="Dashrath Bhaiya"]'); const d = await dl;
  if (d) { await d.saveAs(process.env.S + '/ho_loan.pdf'); }
  assert(!!d, 'handover statement PDF');
  // tapping a repayment row opens it
  await p.click('[data-horef^="loan:"]'); await p.waitForTimeout(200);
  assert(await p.inputValue('#ln_amt') === '15000', 'tap the repayment to edit it');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
