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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); sales=[]; purchases=[]; creditPayments=[]; cashDays=[]; cashMoves=[]; loans=[];
    settings.bankBalance=10000; settings.bankDate='2026-11-01'; settings.openingCash=1000; settings.openingCashDate='2026-11-01'; saveSettings();
    staff=[{id:'r1',name:'Ravi Kumar',role:'Cook',salary:12000,status:'Active',joinDate:'2026-09-01'}];
    investments=[{id:'pl',date:'2026-11-04',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:40000,mode:'UPI',via:'bank'}];
    expenses=[{id:'adv',staffId:'r1',advance:true,date:'2026-11-08',category:'Staff Salary',description:'Ravi Kumar - advance November 2026',amount:1500,mode:'Cash',paidBy:'Cafe cash'}];
    cashDays=[{id:'cd1',date:'2026-11-02',counted:1000,floatLeft:0,receivedBy:'Dashrath Bhaiya'}];
    saveEverything(); renderAll(); openLoansTab('2026-11');`);
  await p.waitForTimeout(300);
  async function add(type, f){ await p.click('[data-lnadd="'+type+'"]'); await p.waitForTimeout(150); await f(); await p.click('#ln_save'); await p.waitForTimeout(250); }
  await add('take', async () => { await p.fill('#ln_party','SBI'); await p.selectOption('#ln_ptype','Bank / NBFC'); await p.fill('#ln_amt','100000'); await p.fill('#ln_date','2026-11-05'); await p.selectOption('#ln_via','bank'); await p.fill('#ln_int','12'); await p.fill('#ln_due','2027-11-05'); });
  await add('take', async () => { await p.fill('#ln_party','Mama ji'); await p.selectOption('#ln_ptype','Relative / friend'); await p.fill('#ln_amt','20000'); await p.fill('#ln_date','2026-11-06'); await p.selectOption('#ln_via','counter'); });
  await add('take', async () => { await p.fill('#ln_party','Roobi Devi Kirana'); await p.selectOption('#ln_ptype','Supplier'); await p.fill('#ln_amt','15000'); await p.fill('#ln_date','2026-11-07'); await p.selectOption('#ln_via','direct'); });
  await add('take', async () => { await p.fill('#ln_party','Uncle'); await p.selectOption('#ln_ptype','Relative / friend'); await p.fill('#ln_amt','5000'); await p.fill('#ln_date','2026-11-09'); await p.selectOption('#ln_via','held:Dashrath Bhaiya'); });
  await add('give', async () => { await p.fill('#ln_party','Ravi Kumar'); await p.selectOption('#ln_ptype','Staff'); await p.fill('#ln_amt','3000'); await p.fill('#ln_date','2026-11-10'); await p.selectOption('#ln_via','counter'); });
  await add('collect', async () => { await p.fill('#ln_party','Ravi Kumar'); await p.fill('#ln_amt','1000'); await p.fill('#ln_date','2026-11-15'); await p.selectOption('#ln_via','counter'); });
  // over-repayment refused, partner refused
  await p.click('[data-lnadd="repay"]'); await p.fill('#ln_party','SBI'); await p.fill('#ln_amt','200000'); await p.click('#ln_save'); await p.waitForTimeout(150);
  assert(/only owes SBI|only owes/.test(await p.textContent('#ln_err')), 'cannot repay more than owed');
  await p.fill('#ln_party','Rishabh'); await p.fill('#ln_amt','100'); await p.click('#ln_save'); await p.waitForTimeout(150);
  assert(/is a partner/.test(await p.textContent('#ln_err')), 'partner loans sent to the Partners tab');
  await p.fill('#ln_party','SBI'); await p.waitForTimeout(100);
  assert(/Cafe still owes SBI: ₹1,00,000/.test(await p.textContent('#ln_hint')), 'repay form shows what is still owed');
  await p.fill('#ln_amt','10000'); await p.fill('#ln_date','2026-11-20'); await p.selectOption('#ln_via','bank'); await p.click('#ln_save'); await p.waitForTimeout(300);
  // totals
  const tot = JSON.parse(await E(p, `JSON.stringify(loanTotals('2026-11-30'))`));
  console.log('   totals', JSON.stringify(tot));
  assert(tot.cafeOwes === 90000 + 20000 + 15000 + 5000 + 40000 && tot.owedToCafe === 2000, 'cafe owes 1,70,000 (incl. partner loan); 2,000 to collect');
  let t = (await p.textContent('#loansView')).replace(/\s+/g,' ');
  assert(/SBI ?Bank \/ NBFC/.test(t) && /12% a year/.test(t) && /Mama ji/.test(t) && /Rishabh ?Partner/.test(t) && /Ravi Kumar ?Staff/.test(t), 'tab lists every lender / borrower with type');
  assert(/Salary advances to staff/.test(t) && /Ravi Kumar ?₹1,500/.test(t), 'staff salary advance listed for reference');
  // money effects
  assert(await E(p, `cashMovement('2026-11-06').loanIn`) === 20000 && await E(p, `cashMovement('2026-11-10').loanOut`) === 3000 && await E(p, `cashMovement('2026-11-15').loanIn`) === 1000, 'cash loans move counter cash');
  const bm = JSON.parse(await E(p, `JSON.stringify(bankMovements())`));
  assert(bm.oloanin === 100000 && bm.oloanout === 10000 && bm.loanin === 40000, 'bank loan in 1,00,000, repaid 10,000; partner loan 40,000');
  const D = JSON.parse(await E(p, `JSON.stringify(handoverLedger('2026-11'))`)).find(r=>r.holder==='Dashrath Bhaiya');
  assert(D.investIn === 5000, 'loan kept by Dashrath shows in his handover');
  assert(await E(p, 'bankMovements().in') === 140000 && await E(p, 'bankBalanceNow()') === 10000 + 140000 - 10000, 'supplier-paid-directly loan stays out of cafe money');
  const R = JSON.parse(await E(p, `JSON.stringify(cashReview('2026-11'))`));
  console.log('   review ext', JSON.stringify(R.ext));
  assert(Math.abs(R.extTotal - R.change) < 0.01 && R.ext.lTaken === 125000 && R.ext.lRepaid === -10000 && R.ext.lGiven === -3000 && R.ext.lBack === 1000, 'cash review balances with loans in their own lines');
  // calendar
  await E(p, `openCalendarOn('2026-11-06')`); await p.waitForTimeout(300);
  const card = (await p.evaluate(() => [...document.querySelectorAll('#dayPanel .cashday')].map(c=>c.innerText).find(x=>/^Loans/.test(x)))).replace(/\s+/g,' ');
  assert(/Loan taken · Mama ji/.test(card) && /into the counter/.test(card), 'calendar day card shows the loan');
  assert(await p.evaluate(() => [...document.querySelectorAll('.daycell[data-date="2026-11-06"] .dots i')].some(i => /8D6E63/i.test(i.getAttribute('style')))), 'calendar dot for loan days');
  await E(p, `openCalendarOn('2026-11-08')`); await p.waitForTimeout(200);
  assert(/Salary advance · Ravi Kumar/.test(await p.textContent('#dayPanel')), 'day card lists the staff advance');
  await p.click('#dp_loans'); await p.waitForTimeout(200);
  assert(await E(p, 'recSub') === 'loans' && await E(p, 'lnMonth') === '2026-11', '"All loans" opens the month in the Loans tab');
  await p.click('#lnNext'); await p.waitForTimeout(200);
  assert(await p.textContent('#calTitle') === 'December 2026', 'Loans month change moves the calendar');
  await p.click('#lnPrev');
  // edit / delete
  await p.click('[data-lnsrc="loan"][data-lnid]'); await p.waitForTimeout(150);
  assert(await p.isVisible('#ln_amt'), 'tap an entry to edit');
  await E(p, 'closeForm()');
  // quick repay button for a lender
  await p.click('[data-lnquick="repay"][data-lnparty="Mama ji"]'); await p.waitForTimeout(150);
  assert(await p.inputValue('#ln_party') === 'Mama ji' && await p.inputValue('#ln_amt') === '20000' && await p.inputValue('#ln_type') === 'repay', 'Repay button fills in lender and amount owed');
  await E(p, 'closeForm()');
  // PDF
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null); await p.click('#ln_pdf'); const d = await dl;
  if (d) await d.saveAs(process.env.S + '/loans.pdf');
  assert(!!d && /Loans_2026-11\.pdf$/.test(d.suggestedFilename()), 'loan statement PDF');
  // dashboard
  await p.click('nav.tabs button[data-v="dashboard"]'); await p.waitForTimeout(200);
  assert(/Loans the cafe owes/.test(await p.textContent('#moneyPos')), 'dashboard shows loans owed');
  await p.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  const p2 = await open(b, errs);
  assert(await E(p2, 'loans.length') === 7, 'other phone gets the loans');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
