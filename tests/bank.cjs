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
    settings.bankBalance=50000; settings.bankDate='2026-10-10'; saveSettings();
    cashDays=[{id:'c1',date:'2026-10-02',counted:5000,floatLeft:500,receivedBy:'Rishabh'}]; saveCashDays();
    cashMoves=[{id:'m0',date:'2026-10-05',holder:'Rishabh',type:'bank',amount:1000},
               {id:'m1',date:'2026-10-10',holder:'Rishabh',type:'bank',amount:2000},
               {id:'m2',date:'2026-10-12',holder:'Rishabh',type:'counter',amount:300}]; saveCashMoves(); renderAll();`);
  assert(await E(p, `bankBalanceNow()`) === 52000, 'noted 50,000 on 10 Oct + 2,000 deposited that day; the 5 Oct deposit is already in the noted figure');
  await E(p, `showView('records'); switchRecordsSub('handover'); hoMonth='2026-10'; renderHandoverView();`);
  await p.click('[data-hobank="Rishabh"]'); await p.fill('#cm_amt','1500'); await p.fill('#cm_date','2026-10-20'); await p.click('#cm_save'); await p.waitForTimeout(200);
  assert(await E(p, `bankBalanceNow()`) === 53500, 'new deposit raises bank to 53,500');
  await E(p, `switchRecordsSub('cash')`);
  const c = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  assert(/Handover cash deposited ?₹3,500/.test(c) && /Cafe bank account now ?₹53,500/.test(c), 'Cash tab shows deposits and bank now');
  assert(/₹53,500 bank/.test(await p.textContent('#recordsTotalLbl')), 'records header uses bank now');
  await p.click('nav.tabs button[data-v="dashboard"]'); await p.waitForTimeout(200);
  assert(/Bank.*₹53,500/.test((await p.textContent('#moneyPos')).replace(/\s+/g,' ')), 'dashboard money position uses bank now');
  // deleting the deposit reverses it
  await E(p, `cashMoves = cashMoves.filter(function(m){ return m.amount!==1500; }); saveCashMoves(); renderAll();`);
  assert(await E(p, `bankBalanceNow()`) === 52000, 'deleting a deposit takes it back off');
  // updating the noted balance resets the base
  await E(p, `settings.bankBalance=60000; settings.bankDate='2026-11-01'; saveSettings(); renderAll();`);
  assert(await E(p, `bankBalanceNow()`) === 60000, 'a newly noted balance replaces older deposits');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
