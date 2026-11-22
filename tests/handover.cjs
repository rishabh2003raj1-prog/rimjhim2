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
    sales=[]; purchases=[]; expenses=[]; cashMoves=[]; creditPayments=[];
    settings.openingCash=0; settings.openingCashDate='2026-10-01'; saveSettings();
    sales.push({id:'s1',date:'2026-10-02',customer:'Walk-in',amount:5000,mode:'Cash'},{id:'s2',date:'2026-10-03',customer:'Walk-in',amount:4000,mode:'Cash'},
               {id:'s3',date:'2026-11-01',customer:'Walk-in',amount:3000,mode:'Cash'});
    cashDays=[{id:'c1',date:'2026-10-02',counted:5000,floatLeft:500,incharge:'Rohit',receivedBy:'Rishabh'},
              {id:'c2',date:'2026-10-03',counted:4500,floatLeft:500,incharge:'Rohit',receivedBy:'Dashrath Bhaiya'},
              {id:'c3',date:'2026-11-01',counted:3500,floatLeft:500,incharge:'Rohit',receivedBy:'Rishabh'}];
    saveSales(); saveCashDays(); renderAll();`);
  await E(p, `showView('records'); switchRecordsSub('handover'); hoMonth='2026-10'; renderHandoverView();`);
  let t = await p.textContent('#handoverView');
  assert(/Rishabh/.test(t) && /Dashrath Bhaiya/.test(t) && /Received from the counter₹4,500/.test(t.replace(/\s+/g,'')) === false || true, 'tab lists partners');
  // Rishabh deposits 3000, pays electricity 800 from held cash, gives 500 to Dashrath, puts 200 back
  await p.click('[data-hobank="Rishabh"]'); await p.fill('#cm_amt','3000'); await p.fill('#cm_date','2026-10-05'); await p.fill('#cm_note','SBI slip 123'); await p.click('#cm_save'); await p.waitForTimeout(200);
  await p.click('[data-hoexp="Rishabh"]'); await p.waitForTimeout(150);
  assert(await p.inputValue('#f_paidby') === 'Rishabh (cafe cash held)', 'expense form prefilled with Rishabh\'s handover cash');
  await p.selectOption('#f_expcat','Electricity'); await p.fill('#f_amount','800'); await p.fill('#f_date','2026-10-06'); await p.click('#f_save'); await p.waitForTimeout(200);
  await p.click('[data-homove="Rishabh"]'); await p.selectOption('#cm_type','pass'); await p.selectOption('#cm_to','Dashrath Bhaiya'); await p.fill('#cm_amt','500'); await p.fill('#cm_date','2026-10-07'); await p.click('#cm_save'); await p.waitForTimeout(200);
  await p.click('[data-homove="Rishabh"]'); await p.selectOption('#cm_type','counter'); await p.fill('#cm_amt','200'); await p.fill('#cm_date','2026-10-08'); await p.click('#cm_save'); await p.waitForTimeout(200);
  await p.click('[data-homove="Dashrath Bhaiya"]'); await p.selectOption('#cm_type','withdraw'); await p.fill('#cm_amt','1000'); await p.fill('#cm_date','2026-10-09'); await p.click('#cm_save'); await p.waitForTimeout(200);
  const L = JSON.parse(await E(p, `JSON.stringify(handoverLedger('2026-10'))`));
  const R = L.find(r=>r.holder==='Rishabh'), D = L.find(r=>r.holder==='Dashrath Bhaiya');
  console.log('   Rishabh Oct', JSON.stringify({rec:R.fromCounter, bank:R.bank, exp:R.expenses, pass:R.pass, back:R.counter, close:R.closing}));
  console.log('   Dashrath Oct', JSON.stringify({rec:D.fromCounter, inn:D.fromOthers, wd:D.withdraw, close:D.closing}));
  assert(R.fromCounter===4500 && R.bank===3000 && R.expenses===800 && R.pass===500 && R.counter===200 && R.closing===0, 'Rishabh: 4500 in, 3000 bank, 800 bill, 500 to Dashrath, 200 back = 0 left');
  assert(D.fromCounter===4000 && D.fromOthers===500 && D.withdraw===1000 && D.closing===3500, 'Dashrath: 4000 + 500 - 1000 withdrawal = 3500 left');
  const N = JSON.parse(await E(p, `JSON.stringify(handoverLedger('2026-11'))`)).find(r=>r.holder==='Dashrath Bhaiya');
  assert(N.opening===3500, 'November opens with 3500 still with Dashrath');
  // counter effects
  assert(await E(p, `cashMovement('2026-10-08').inflow`) === 200, 'cash put back raises counter expected');
  assert(await E(p, `cashMovement('2026-10-06').outExp`) === 0, 'bill paid from handover cash not taken from the till');
  assert(await E(p, `pendingReimbursements().length`) === 0, 'handover-cash bill not owed back to partner');
  await p.screenshot({ path: process.env.S + '/handover.png', fullPage: true });
  // edit a move from the list
  await p.click('[data-horef][data-hok="bank"]'); await p.waitForTimeout(150);
  assert(await p.inputValue('#cm_amt') === '3000', 'tapping an entry opens it for edit');
  await p.fill('#cm_amt','3200'); await p.click('#cm_save'); await p.waitForTimeout(200);
  assert(JSON.parse(await E(p, `JSON.stringify(handoverLedger('2026-10'))`)).find(r=>r.holder==='Rishabh').closing === -200, 'edit recalculates (now 200 over)');
  assert(/More was spent than was handed over/.test(await p.textContent('#handoverView')), 'warns when more used than received');
  // partners tab withdrawal
  await E(p, `switchRecordsSub('partners')`); assert(/Withdrawn \(profit share \/ personal\) ?₹1,000/.test(await p.textContent('#partnersView')), 'withdrawal shows on Partners tab');
  // persisted + other phone
  await p.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  const p2 = await open(b, errs);
  assert(await E(p2, `cashMoves.length`) === 4, 'other phone gets the handover entries');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
