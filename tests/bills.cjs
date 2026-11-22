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
  const dis = () => p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  await E(p, `settings.fixedCostHistory=[{from:'2026-07', costs:{Rent:20000, Electricity:3800, 'Wifi / Internet':799}}]; settings.fixedCostMonths={}; settings.billKinds={}; staff=[];
    expenses=[{id:'x1',date:'2026-10-03',category:'Electricity',description:'Electricity - September 2026',amount:3200,mode:'UPI',paidBy:'Cafe UPI/bank'},
              {id:'x2',date:'2026-08-05',category:'Rent',description:'Rent - August 2026',amount:20000,mode:'UPI',paidBy:'Cafe UPI/bank'}];
    saveSettings(); saveExpense(); renderAll();`);
  let r = await E(p, `({ aug: billFor('Electricity','2026-08'), sep: billFor('Electricity','2026-09'), rentNov: billFor('Rent','2026-11'), wifiNov: billFor('Wifi / Internet','2026-11') })`);
  assert(r.aug.source==='none' && r.aug.amount===0, 'electricity not assumed from 3,800: '+JSON.stringify(r.aug));
  assert(r.sep.source==='paid' && r.sep.amount===3200, 'September electricity = what was paid');
  assert(r.rentNov.kind==='fixed' && r.rentNov.amount===20000, 'rent stays fixed');
  assert(r.wifiNov.source==='none', 'wifi variable by default, not assumed');
  // Enter October electricity through the sheet
  await E(p, `setAppMonth('2026-10'); showView('records'); switchRecordsSub('fixed'); renderAll();`);
  await p.click('[data-bamt="Electricity"]');
  await p.fill('#ba_amt','4100'); await p.fill('#ba_due','2026-10-15'); await p.fill('#ba_note','412 units'); await p.click('#ba_save');
  r = await E(p, `(function(){ var sm = fixedMonthSummary('2026-10'), e = sm.rows.find(function(x){return x.name==='Electricity';}); return { amt:e.planned, due:e.due, od:e.overdue, src:e.source, nov:billFor('Electricity','2026-11'), sep:billFor('Electricity','2026-09').amount }; })()`);
  assert(r.amt===4100 && r.due===4100 && r.od===true && r.src==='entered', 'October bill entered, due, overdue: '+JSON.stringify(r));
  assert(r.nov.source==='none' && r.nov.amount===0 && r.nov.recent[0].amount===4100 && r.nov.recent[1].amount===3200, 'November not assumed; earlier months shown for reference');
  assert(r.sep===3200, 'September untouched');
  let t = (await p.textContent('#fixedView')).replace(/\s+/g,' ');
  assert(/Fixed bills · same every month/.test(t) && /Variable bills · different every month/.test(t) && /412 units/.test(t) && /overdue/.test(t), 'sections + note + overdue');
  // November view
  await p.click('#fcNext');
  t = (await p.textContent('#fixedView')).replace(/\s+/g,' ');
  assert(/not entered/.test(t) && /Earlier: Oct ₹4,100 · Sep ₹3,200/.test(t) && /reference only, not counted/.test(t), 'November shows not entered with reference');
  r = await E(p, `fixedMonthSummary('2026-11').due`);
  assert(r===20000, 'still to pay counts only rent (no assumed electricity): '+r);
  assert(/Bill history/.test(t) && /—/.test(t), 'bill history table');
  await E(p, `window.scrollTo(0,0)`); await p.screenshot({ path: process.env.S + '/bills_nov.png', fullPage:true });
  // Rent increase from December only
  await E(p, `openBillAmount('Rent','2026-12')`); await p.fill('#ba_amt','22000'); await p.fill('#ba_dd','5'); await p.click('#ba_save');
  r = await E(p, `[billFor('Rent','2026-11').amount, billFor('Rent','2026-12').amount, billDueDate('2026-12','Rent')]`);
  assert(r[0]===20000 && r[1]===22000 && r[2]==='2026-12-05', 'rent change from December keeps November: '+r);
  // Manage: wifi -> fixed 799, add Gas cylinder (variable)
  await p.click('#fc_setup');
  await p.selectOption('.fckind[data-c="Wifi / Internet"]','fixed'); await p.fill('.fcin[data-c="Wifi / Internet"]','799');
  await p.fill('#fc_newname','Gas cylinder'); await p.click('#fc_save');
  r = await E(p, `({ wifi: billFor('Wifi / Internet','2026-11'), gas: billKind('Gas cylinder'), cats: FIXED_CATS.indexOf('Gas cylinder')>=0, elec: billFor('Electricity','2026-11').source })`);
  assert(r.wifi.kind==='fixed' && r.wifi.amount===799 && r.gas==='variable' && r.cats && r.elec==='none', 'manage: wifi fixed, gas added variable: '+JSON.stringify(r));
  // Pay a variable bill without entering it
  await E(p, `expenses.push({id:'x3',date:'2026-11-12',category:'Gas cylinder',description:'Gas cylinder - November 2026',amount:1100,mode:'Cash',paidBy:'Cafe cash'}); saveExpense(); renderAll();`);
  r = await E(p, `billFor('Gas cylinder','2026-11')`);
  assert(r.source==='paid' && r.amount===1100, 'paid without entering: amount = payment');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
