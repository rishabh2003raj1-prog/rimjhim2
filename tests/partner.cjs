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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners();
    settings.openingCash=0; settings.openingCashDate='2026-07-01'; settings.bankBalance=0; settings.bankDate='2026-07-01'; saveSettings();
    sales=[{id:'s1',date:'2026-10-10',customer:'W',amount:50000,mode:'UPI'},{id:'s2',date:'2026-10-11',customer:'W',amount:20000,mode:'Cash'}];
    purchases=[{id:'p1',date:'2026-10-12',vendor:'V',item:'Milk',qty:100,unit:'L',rate:60,gst:0,mode:'Cash',paidBy:'Cafe cash'}];
    expenses=[{id:'e1',date:'2026-10-13',category:'Rent',description:'Rent - October 2026',amount:25000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'}];
    cashMoves=[]; cashDays=[]; creditPayments=[];
    // legacy entries
    investments=[{id:'l1',date:'2026-07-01',partner:'Rishabh',invType:'Investment',purpose:'Cafe purchase price',amount:300000,mode:'Bank Transfer',notes:''},
                 {id:'l2',date:'2026-07-01',partner:'Dashrath Bhaiya',invType:'Investment',purpose:'Cafe purchase price',amount:300000,mode:'Bank Transfer',notes:''},
                 {id:'l3',date:'2026-07-05',partner:'Dashrath Bhaiya',invType:'Investment',purpose:'Renovation / interiors',amount:80000,mode:'Cash',notes:''},
                 {id:'l4',date:'2026-07-20',partner:'Rishabh',invType:'Investment',purpose:'Working capital',amount:40000,mode:'UPI',notes:''},
                 {id:'l5',date:'2026-10-02',partner:'Rishabh',invType:'Investment',purpose:'Working capital',amount:5000,mode:'Cash',notes:'',cashTo:''}];
    saveEverything(); renderAll();`);
  const k = JSON.parse(await E(p, `JSON.stringify(investments.map(function(v){ return [v.id, invKind(v), invCategory(v), invDest(v)]; }))`));
  console.log('   ' + JSON.stringify(k));
  assert(k[0][1]==='capital' && k[0][2]==='Shop purchase' && k[0][3]==='direct', 'old shop purchase: capital, paid directly');
  assert(k[2][2]==='Shop renovation / interiors' && k[2][3]==='direct', 'old renovation: paid directly');
  assert(k[3][1]==='loan' && k[3][3]==='bank' && k[4][3]==='counter', 'old working capital becomes a loan; UPI -> bank, cash -> counter');
  assert(await E(p, 'bankMovements().loanin') === 40000, 'only the working-capital loan entered the bank, not the shop purchase');
  // partners tab
  await E(p, `showView('records'); switchRecordsSub('partners');`);
  let t = (await p.textContent('#partnersView')).replace(/\s+/g,' ');
  assert(/Capital in the business ?₹6,80,000/.test(t) && /loans outstanding ?₹45,000/.test(t), 'capital 6,80,000, loans 45,000');
  assert(/Shop purchase ?₹3,00,000/.test(t) && /Shop renovation \/ interiors ?₹80,000/.test(t), 'capital by category');
  const prof = await E(p, 'allTimeProfit()'); console.log('   profit', prof);
  assert(prof === 39000, 'profit 70,000 - 6,000 - 25,000 = 39,000');
  // add a new capital investment via the form: equipment, paid directly
  await p.click('[data-pinv="Dashrath Bhaiya"]'); await p.waitForTimeout(150);
  assert(await p.inputValue('#f_partner') === 'Dashrath Bhaiya' && await p.inputValue('#f_via') === 'direct', 'add money prefilled: partner, paid directly by default');
  await p.selectOption('#f_purpose','Equipment / furniture'); await p.fill('#f_amount','60000'); await p.fill('#f_date','2026-10-14'); await p.click('#f_save'); await p.waitForTimeout(200);
  assert(await E(p, 'partnerMoney("Dashrath Bhaiya").byCat["Equipment / furniture"]') === 60000 && await E(p, 'bankMovements().loanin') === 40000, 'equipment capital recorded, bank untouched');
  // a loan into the counter
  await p.click('[data-pinv="Dashrath Bhaiya"]'); await p.selectOption('#f_invtype','Loan'); await p.waitForTimeout(100);
  assert(!(await p.isVisible('#f_purpose')), 'no category picker for loans');
  await p.selectOption('#f_via','counter'); await p.fill('#f_amount','10000'); await p.fill('#f_date','2026-10-15'); await p.click('#f_save'); await p.waitForTimeout(200);
  assert(await E(p, 'cashMovement("2026-10-15").invIn') === 10000, 'loan into the counter adds counter cash');
  // repay loan button: prefilled with outstanding, from bank, can't exceed
  t = (await p.textContent('#partnersView')).replace(/\s+/g,' ');
  await p.click('[data-prepay="Rishabh"]'); await p.waitForTimeout(150);
  assert(await p.inputValue('#f_invtype') === 'Loan repayment' && await p.inputValue('#f_amount') === '45000' && await p.inputValue('#f_via') === 'bank', 'repay loan prefilled 45,000 from bank');
  await p.fill('#f_amount','50000'); await p.click('#f_save'); await p.waitForTimeout(150);
  assert(/only ₹45,000/.test(await p.textContent('#f_err')), 'cannot repay more than outstanding');
  await p.fill('#f_amount','15000'); await p.fill('#f_date','2026-10-20'); await p.click('#f_save'); await p.waitForTimeout(200);
  assert(await E(p, 'partnerMoney("Rishabh").outstanding') === 30000 && await E(p, 'bankMovements().loanrepay') === 15000, 'repaid 15,000 from bank; 30,000 left');
  // cash review separates partner money
  const R = JSON.parse(await E(p, `JSON.stringify(cashReview('2026-10'))`));
  console.log('   Oct ext', JSON.stringify(R.ext), 'change', R.change, 'directIn', R.directIn);
  assert(Math.abs(R.extTotal - R.change) < 0.01, 'cash review still balances');
  assert(R.ext.pLoan === 15000 && R.ext.pRepay === -15000 && !R.ext.invest, 'loans and repayments under partner money');
  assert(R.directIn === 60000, 'equipment paid directly noted separately');
  await E(p, `switchRecordsSub('review'); crMonth='2026-10'; renderCashReviewView();`);
  t = (await p.textContent('#reviewView')).replace(/\s+/g,' ');
  assert(/From running the cafe/.test(t) && /Cafe’s own cash result/.test(t) && /Partner money & loans \(not cafe earnings\)/.test(t), 'review shows the two sections');
  // settle-as-loan
  const T = await E(p, 'fmtDate(new Date())');
  await E(p, `expenses.push({id:'e9',date:'${T}',category:'Repairs',amount:700,mode:'Cash',paidBy:'Rishabh (personal)'}); saveExpense(); openOwedSheet();`);
  await p.click('[data-settle="exp:e9"]'); await p.selectOption('#rp_mode','invest'); await p.click('#rp_go'); await p.waitForTimeout(200); await p.click('#ow_close');
  assert(await E(p, 'partnerMoney("Rishabh").outstanding') === 30700 && await E(p, `cashMovement('${T}').invIn`) === 0, 'bill counted as a loan: outstanding +700, no cash moved');
  // investments list labels
  await E(p, `switchRecordsSub('investments')`);
  t = (await p.textContent('#investList')).replace(/\s+/g,' ');
  assert(/Loan repaid/.test(t) && /from cafe bank/.test(t) && /paid directly/.test(t) && /Loan to cafe/.test(t), 'investments list shows kind and where');
  // dashboard card
  await p.click('nav.tabs button[data-v="dashboard"]'); await p.waitForTimeout(200);
  assert(/Working capital loans outstanding/.test(await p.textContent('#investSummary')), 'dashboard shows loans outstanding');
  // PDF report with investment section
  await E(p, `openReportsSheet()`); await p.click('#rpAll');
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null); await p.click('#rpGo'); const d = await dl;
  if (d) { await d.saveAs(process.env.S + '/inv_report.pdf'); }
  assert(!!d, 'PDF report with partner section generates');
  await E(p, `showView('records'); switchRecordsSub('partners');`); await p.waitForTimeout(200);
  await p.screenshot({ path: process.env.S + '/partners.png', fullPage: true });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
