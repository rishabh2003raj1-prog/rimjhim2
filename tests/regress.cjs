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
  await E(p, `staff=[{id:'r1',name:'Rohit Chhotu',role:'Helper',salary:10000,status:'Active',joinDate:'2026-07-15'},
                     {id:'v1',name:'Ravi Kumar',role:'Cook',salary:20000,status:'Active',joinDate:'2026-08-29'}];
    attendance=[{id:'a1',date:'2026-07-20',staffId:'r1',status:'Leave'},{id:'a2',date:'2026-07-21',staffId:'r1',status:'Absent'}];
    payroll=[{id:'p1',staffId:'r1',month:'2026-08',extraLeave:'waived',waivedAmount:666.67}];
    settings.fixedCostHistory=[{from:'2026-07',costs:{Rent:1,Electricity:500}},{from:'2026-08',costs:{Rent:30000,Electricity:1552}}];
    expenses=[{id:'x0',date:'2026-07-31',category:'Staff Salary',description:'Rohit Chhotu - salary July 2026',amount:5000,mode:'UPI'},
              {id:'x9',date:'2026-07-31',category:'Rent',description:'Rent - July 2026',amount:1,mode:'UPI'},
              {id:'x8',date:'2026-07-31',category:'Electricity',description:'Electricity',amount:500,mode:'UPI'},
              {id:'x1',date:'2026-08-05',category:'Rent',description:'Rent - August 2026',amount:30000,mode:'UPI'},
              {id:'x2',date:'2026-08-20',category:'Electricity',description:'Electricity',amount:1552,mode:'UPI'},
              {id:'x3',date:'2026-08-31',category:'Staff Salary',description:'Rohit Chhotu - salary August 2026',amount:10000,mode:'UPI'},
              {id:'x4',date:'2026-09-03',category:'Staff Salary',description:'Ravi Kumar - salary August 2026',amount:2000,mode:'Cash'}];
    savePayroll(); saveStaff(); saveAttend(); saveSettings(); saveExpense(); renderAll();`);
  const j = JSON.parse(await E(p, `JSON.stringify(salaryFor(staffById('r1'),'2026-07'))`));
  assert(j.base === 5666.67 && j.net === 5000 && j.balance === 0, 'Rohit July 17 days 5666.67, 2 unpaid -> 5000, paid');
  const fm = JSON.parse(await E(p, `JSON.stringify(fixedMonthSummary('2026-07'))`));
  assert(fm.planned === 5501 && fm.due === 0, 'July fixed 5501, nothing due');
  await E(p, `customFrom='2026-08-01'; customTo='2026-08-31';`);
  await p.click('nav.tabs button[data-v="dashboard"]'); await p.waitForTimeout(300);
  assert(await p.textContent('#kpiExp') === '₹43,552' && /Fixed cost this month₹43,552/.test(await p.textContent('#fixedCosts')), 'August expenses KPI = fixed card = 43,552');
  await p.click('#fc_edit'); await p.waitForTimeout(300);
  assert(await E(p,'fcMonth')==='2026-08' && /paid in September 2026/.test(await p.textContent('#fixedView')), 'Bills opens August, flags Sept payment');
  await p.click('[data-bamt="Electricity"]'); await p.fill('#ba_amt','1700'); await p.click('#ba_save'); await p.waitForTimeout(300);
  assert(await E(p,`plannedFixed('2026-08').Electricity`)===1700 && await E(p,`plannedFixed('2026-09').Electricity`)===0 && await E(p,`billFor('Electricity','2026-09').source`)==='none', 'electricity bill for August only; September not assumed');
  await p.click('[data-bsal="r1"]'); await p.fill('#sa_amt','11000'); await p.selectOption('#sa_scope','on'); await p.click('#sa_save'); await p.waitForTimeout(300);
  assert(await E(p,`salaryAt(staffById('r1'),'2026-07')`)===10000 && await E(p,`salaryAt(staffById('r1'),'2026-08')`)===11000, 'salary from August; July unchanged');
  await p.click('[data-bpcal="2026-08-20"]'); await p.waitForTimeout(300);
  assert(await p.textContent('#calTitle')==='August 2026', 'calendar link');
  await p.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  const p2 = await open(b, errs); await p2.waitForTimeout(1000);
  assert(await E(p2,`salaryAt(staffById('r1'),'2026-08')`)===11000 && await E(p2,`expenses.length`)===7, 'second phone gets the data');
  await E(p2, `expenses.push({id:'x7',date:'2026-08-10',category:'Repairs',description:'tap',amount:300,mode:'Cash'}); saveExpense();`);
  await p2.waitForFunction(() => /Saved to cloud/.test(document.getElementById('saveStatus').textContent), null, { timeout: 15000 });
  await p.click('#refreshBtn'); await p.waitForTimeout(1500);
  assert(await E(p,`expenses.length`)===8, 'Refresh pulls the other phone change');
  console.log('errors', errs); await b.close();
})();
