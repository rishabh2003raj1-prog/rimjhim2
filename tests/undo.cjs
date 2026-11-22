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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); sales=[]; creditPayments=[]; cashDays=[]; cashMoves=[]; payroll=[];
    settings.bankBalance=50000; settings.bankDate='2026-10-01'; settings.openingCash=5000; settings.openingCashDate='2026-10-01'; saveSettings();
    investments=[{id:'leg',date:'2026-10-03',partner:'Dashrath Bhaiya',invType:'Investment',purpose:'Working capital',amount:300,mode:'Cash',viaBill:true,notes:'Paid Repairs from own pocket'}];
    expenses=[{id:'e1',date:'2026-10-05',category:'Rent',description:'Rent - October 2026',amount:30000,mode:'UPI',paidBy:'Rishabh (personal)'},
              {id:'e2',date:'2026-10-06',category:'Electricity',amount:1500,mode:'UPI',paidBy:'Rishabh (personal)'},
              {id:'e3',date:'2026-10-03',category:'Repairs',amount:300,mode:'Cash',paidBy:'Dashrath Bhaiya (personal)',settled:true}];
    purchases=[{id:'p1',billId:'b1',date:'2026-10-07',vendor:'Kirana',item:'Milk',qty:10,unit:'L',rate:60,gst:0,mode:'Cash',paidBy:'Dashrath Bhaiya (personal)'}];
    bills=[];
    staff=[{id:'g1',name:'Gurfan',role:'Helper',salary:15000,status:'Active',joinDate:'2026-09-01'}];
    saveEverything(); renderAll();`);
  // settle rent by bank, electricity as a loan, purchase in cash
  await E(p, 'openOwedSheet()'); await p.click('[data-settle="exp:e1"]'); await p.selectOption('#rp_mode','bank'); await p.fill('#rp_date','2026-10-20'); await p.click('#rp_go'); await p.waitForTimeout(200);
  await p.click('[data-settle="exp:e2"]'); await p.selectOption('#rp_mode','invest'); await p.click('#rp_go'); await p.waitForTimeout(200);
  await p.click('[data-settle="b1"]'); await p.selectOption('#rp_mode','cash'); await p.fill('#rp_date','2026-10-21'); await p.click('#rp_go'); await p.waitForTimeout(200);
  const bankAfter = await E(p, 'bankBalanceNow()'), loanAfter = await E(p, 'partnerMoney("Rishabh").outstanding');
  assert(bankAfter === 20000 && loanAfter === 1500 && await E(p, 'pendingReimbursements().length') === 0, 'settled: bank 20,000, Rishabh loan 1,500, nothing owed');
  // review screen from the owed sheet
  await p.click('#ow_review'); await p.waitForTimeout(200);
  let t = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Review settlements/.test(t) && /repaid by UPI \/ bank on 20 Oct/.test(t) && /counted as their loan/.test(t) && /repaid in cash from the counter on 21 Oct/.test(t) && /method not recorded/.test(t), 'review lists settled items with how and when');
  // undo the bank repayment (touch mistake)
  await p.click('[data-unowed="exp:e1"]'); console.log('   ' + (await p.textContent('#dlgMsg')).replace(/\n+/g,' | ')); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(300);
  assert(await E(p, 'bankBalanceNow()') === 50000 && await E(p, 'pendingReimbursements().filter(function(g){return g.id==="exp:e1";}).length') === 1, 'rent undo: owed again, bank back to 50,000');
  // undo the loan one
  await p.click('[data-unowed="exp:e2"]'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(300);
  assert(await E(p, 'partnerMoney("Rishabh").outstanding') === 0 && await E(p, 'investments.filter(function(v){return v.fromOwed==="exp:e2";}).length') === 0, 'loan undo: loan entry removed');
  // undo the old (legacy) settled repair -> legacy loan entry found and removed
  await p.click('[data-unowed="exp:e3"]'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(300);
  assert(await E(p, 'investments.filter(function(v){return v.id==="leg";}).length') === 0, 'older settled item: its loan entry removed too');
  // undo & settle again on the cash purchase -> opens repay sheet; settle by bank instead
  const counterBefore = await E(p, `cashMovement('2026-10-21').repaid`);
  await p.click('[data-reowed="b1"]'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(300);
  assert(await p.isVisible('#rp_mode') && counterBefore === 600 && await E(p, `cashMovement('2026-10-21').repaid`) === 0, 'undo & settle again: counter restored, repay sheet open');
  await p.selectOption('#rp_mode','bank'); await p.fill('#rp_date','2026-10-22'); await p.click('#rp_go'); await p.waitForTimeout(200);
  assert(await E(p, 'bankBalanceNow()') === 49400, 'settled again correctly by bank');
  await E(p, 'closeForm()');
  // staff: settle September with a round off and a payment, then undo
  await E(p, `salMonth='2026-09'; showView('staff'); switchStaffSub('salary');`); await p.waitForTimeout(300);
  await E(p, `openSettlement(staffById('g1'),'2026-09')`); await E(p, `(function(){ var r=document.querySelector('input[name="st_ch"][value="pay"]'); if(r){ r.checked=true; r.dispatchEvent(new Event('change')); } })()`); await p.selectOption('#st_round','d10'); await p.waitForTimeout(100);
  const payAmt = await p.inputValue('#st_amt'); await p.click('#st_go'); await p.waitForTimeout(300); await p.click('#dlgBtns button');
  assert(await E(p, `salaryFor(staffById('g1'),'2026-09').status`) === 'settled', 'September settled (paid '+payAmt+')');
  assert(await p.$('[data-slundo="g1"]') !== null && await p.$('[data-slsettle="g1"]') === null, 'salary card shows "Undo settlement" instead of settling again');
  await p.click('[data-slundo="g1"]'); await p.waitForTimeout(200);
  assert(await p.isChecked('#us_pay'), 'offers to delete the settlement payment (ticked)');
  await p.click('#us_go'); await p.waitForTimeout(300); console.log('   ' + await p.textContent('#dlgMsg')); await p.click('#dlgBtns button');
  const s9 = JSON.parse(await E(p, `JSON.stringify(salaryFor(staffById('g1'),'2026-09'))`));
  assert(s9.status === 'due' && s9.paid === 0 && !s9.roundOff, 'undone: unsettled, payment deleted, round off gone');
  // settle again with waived leave + payment, undo but keep the payment
  await E(p, `openSettlement(staffById('g1'),'2026-09')`);
  await p.check('input[name="st_ch"][value="waived"]').catch(()=>{}); await p.click('#st_go'); await p.waitForTimeout(300); await p.click('#dlgBtns button');
  const gw1 = await E(p, `goodwillFor(staffById('g1')).balance`);
  await E(p, `openSettlementReview('staff')`); await p.waitForTimeout(200);
  await p.click('[data-unsal="pr_g1_2026-09"]'); await p.uncheck('#us_pay'); await p.click('#us_go'); await p.waitForTimeout(300); await p.click('#dlgBtns button');
  const s9b = JSON.parse(await E(p, `JSON.stringify(salaryFor(staffById('g1'),'2026-09'))`));
  assert(s9b.status !== 'settled' && s9b.paid > 0 && await E(p, `goodwillFor(staffById('g1')).balance`) === 0, 'undo keeping the payment: payment stays, goodwill ('+gw1+') removed');
  // entry points
  await E(p, `closeForm(); showView('records'); switchRecordsSub('partners');`);
  assert(await p.$('#pm_review') !== null, 'Partners tab has the review button');
  await E(p, `switchRecordsSub('expenses')`);
  assert(await p.$('#owed_rev_x') !== null || await p.$('#owed_view_x') !== null, 'Expenses tab offers review');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
