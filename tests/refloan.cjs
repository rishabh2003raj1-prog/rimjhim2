const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const A = await open(b, errs);
  await E(A, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); loans=[{id:'a',date:'2026-11-05',type:'take',party:'SBI',partyType:'Bank / NBFC',amount:100000,via:'bank'}];
    investments=[{id:'pl',date:'2026-11-04',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:40000,mode:'UPI',via:'bank'}]; saveLoans(); saveInvest(); renderAll(); openLoansTab('2026-11');`);
  await A.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  const B = await open(b, errs);
  // phone B: repay SBI, add a loan, edit the partner loan
  await E(B, `loans.push({id:'b',date:'2026-11-10',type:'repay',party:'SBI',partyType:'Bank / NBFC',amount:30000,via:'bank'}); saveLoans();
              investments[0].amount = 50000; saveInvest();`);
  await B.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  // A: stop the 4-second auto-sync so only Refresh can update it
  await A.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, get:()=>true }); });
  await A.waitForTimeout(500);
  const before = await A.textContent('#loansView');
  await A.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, get:()=>false }); });
  await A.click('#refreshBtn'); await A.waitForTimeout(2500);
  const after = (await A.textContent('#loansView')).replace(/\s+/g,' ');
  const tot = JSON.parse(await E(A, `JSON.stringify(loanTotals('2026-11-30'))`));
  console.log('   A totals after refresh', JSON.stringify(tot), '| status', await A.textContent('#saveStatus'));
  assert(tot.cafeOwes === 70000 + 50000, 'refresh brings phone B loan changes (owes 1,20,000)');
  assert(/₹1,20,000/.test(after) || /1,20,000/.test(await A.textContent('#recordsTotalLbl')), 'Loans tab shows the new figure after refresh');
  // A has an unsent local change to loans while B also changed loans -> refresh must merge, not skip
  await E(B, `loans.push({id:'c',date:'2026-11-12',type:'take',party:'Mama ji',partyType:'Relative / friend',amount:20000,via:'counter'}); saveLoans();`);
  await B.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  await A.route('**/api/data/loans_v1**', r => r.abort());   // A's upload fails (bad network)
  await E(A, `loans.push({id:'d',date:'2026-11-13',type:'give',party:'Ravi',partyType:'Staff',amount:2000,via:'counter'}); saveLoans();`);
  await A.waitForTimeout(800);
  await A.click('#refreshBtn'); await A.waitForTimeout(9500);
  const ids = await E(A, `loans.map(function(l){return l.id;}).sort().join(",")`);
  console.log('   A loans after refresh with a stuck upload:', ids, '| status', await A.textContent('#saveStatus'));
  assert(/c/.test(ids) && /d/.test(ids), 'refresh shows the other phone\'s new loan AND keeps this phone\'s unsent one');
  await A.unroute('**/api/data/loans_v1**');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
// ---- app update on refresh ----
(async () => {
  await new Promise(r => setTimeout(r, 200));
})();
