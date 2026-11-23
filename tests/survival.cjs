// Bills paid this month for last month count in last month; survival check on the Dashboard.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  const dis = () => p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  // last month = L, this month = C
  await E(p, `window.C = fmtDate(new Date()).slice(0,7); window.L = shiftMonth(C,-1); window.LN = monthLabel(L);
    staff=[]; saveStaff && saveStaff(); settings.fixedCosts = {}; settings.fixedCostMonths = {}; saveSettings();
    sales=[{id:'s1',date:L+'-10',customer:'Walk-in',amount:100000,mode:'UPI'}];
    purchases=[{id:'p1',date:L+'-05',item:'Milk',vendor:'Dairy',qty:1,unit:'lot',rate:30000,category:'Dairy'},{id:'p2',date:L+'-12',item:'Fridge repair',vendor:'X',qty:1,unit:'job',rate:5000,category:'Repairs & maintenance'}];
    expenses=[{id:'e1',date:C+'-05',category:'Electricity',description:'Electricity bill',amount:4000,mode:'UPI'},
      {id:'e2',date:L+'-02',category:'Rent',description:'Shop rent',amount:15000,mode:'Bank Transfer'},
      {id:'e3',date:C+'-03',category:'Staff Salary',description:'Ravi - '+LN+' salary',amount:20000,mode:'Cash'},
      {id:'e4',date:L+'-20',category:'Maintenance',description:'AC service',amount:3000,mode:'Cash'}];
    saveSales(); savePurch(); saveExpense(); recPeriod='month'; setAppDate(C+'-20'); renderAll(); showView('records'); switchRecordsSub('expenses');`);
  let ids = await E(p, `recExpIn().map(function(x){ return x.id; }).sort().join()`);
  assert(ids==='e1', 'before: this month shows only the unlabelled electricity bill (salary for last month already moved): '+ids);
  assert(/2 bills paid early in a month/.test(await p.textContent('#expenseList')), 'Expenses tab asks which month it is for');
  await p.click('#fm_open'); await p.waitForSelector('[data-fm="e1"]');
  await p.screenshot({ path: process.env.S+'/formonth_review.png' });
  await p.click(`[data-fm="e1"][data-m="${await E(p,'L')}"]`); await p.waitForTimeout(150); await E(p, 'closeForm()');
  ids = await E(p, `recExpIn().map(function(x){ return x.id; }).sort().join()`);
  assert(ids==='', 'after: nothing from last month counted in this month: "'+ids+'"');
  await E(p, `setAppDate(L+'-15'); renderAll(); switchRecordsSub('expenses');`);
  ids = await E(p, `recExpIn().map(function(x){ return x.id; }).sort().join()`);
  assert(ids==='e1,e2,e3,e4', 'last month has electricity, rent, salary, maintenance: '+ids);
  assert(new RegExp('for '+await E(p,'LN')+' · paid').test(await p.textContent('#expenseList')), 'row says "for <last month> · paid <date>"');
  // New expense form: Electricity paid on the 4th suggests last month
  await E(p, `openForm('expense', null, C+'-04')`); await p.selectOption('#f_expcat', 'Electricity'); await p.waitForTimeout(80);
  assert(await p.$eval('#f_formonth', e => e.value)===await E(p,'L'), 'form: electricity paid on the 4th → last month');
  await p.selectOption('#f_expcat', 'Rent'); await p.waitForTimeout(80);
  assert(await p.$eval('#f_formonth', e => e.value)===await E(p,'C'), 'form: rent → month paid');
  await p.selectOption('#f_formonth', await E(p,'L')); await p.fill('#f_amount', '1000'); await p.fill('#f_desc','rent top-up'); await p.click('#f_save'); await p.waitForTimeout(150);
  assert(await E(p, `expenses.find(function(x){ return x.description==='rent top-up'; }).forMonth===L`), 'chosen month saved');
  await E(p, `expenses = expenses.filter(function(x){ return x.description!=='rent top-up'; }); saveExpense(); renderAll();`);
  // Survival check
  const r = await E(p, `(function(){ var r = survivalFor(L); return { sales:r.sales, goods:r.goods, need:r.need, gap:r.gap, nc:r.notCounted, v:survivalVerdict(r).i }; })()`);
  console.log('   '+JSON.stringify(r));
  assert(r.goods===30000 && r.need===69000 && r.gap===31000 && r.nc===8000 && r.v==='✅', 'last month: essentials 69,000 (goods 30k + rent 15k + electricity 4k + salary 20k), repairs/maintenance not counted, survives');
  await E(p, `showView('dashboard'); renderAll();`); await p.waitForTimeout(200);
  assert(await p.$('#survivalBox .survcard') && /Last month/.test(await p.textContent('#survivalBox')), 'Dashboard shows the survival card');
  await p.click('#surv_open'); await p.waitForSelector('.survverdict');
  const st = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Survives/.test(st) && /Left after essentials: ₹31,000/.test(st) && /145%/.test(st), 'sheet: verdict, money left and coverage');
  assert(/Goods & ingredients are 30%/.test(st) && /Rent is 15%/.test(st), 'diagnosis lines');
  assert(/Not counted \(one-off\): ₹8,000/.test(st), 'one-offs listed separately');
  await p.screenshot({ path: process.env.S+'/survival.png', fullPage: false });
  // A short month
  await E(p, `sales[0].amount = 50000; saveSales(); openSurvivalSheet(L);`); await p.waitForTimeout(100);
  const st2 = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Short/.test(st2) && /Short by ₹19,000/.test(st2) && /To cover everything you need about/.test(st2), 'short month: shortfall and break-even sales');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
