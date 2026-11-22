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
  await p.context().grantPermissions([]);
  await E(p, `staff=[{id:'a',name:'Ravi',role:'Helper',salary:9000,status:'Active',joinDate:'2026-09-01'},
                     {id:'b',name:'Ravi Kumar',role:'Cook',salary:15000,status:'Active',joinDate:'2026-09-01'}];
    attendance=[]; payroll=[];
    expenses=[{id:'e1',date:'2026-10-01',category:'Staff Salary',description:'Ravi Kumar - salary September 2026',amount:15000,mode:'UPI'},
              {id:'e2',date:'2026-10-01',category:'Staff Salary',description:'Ravi - salary September 2026',amount:4000,mode:'Cash'}];
    customers=[{id:'c1',name:'Amit'}]; sales=[{id:'s1',date:fmtDate(new Date()),customer:'Amit',customerId:'c1',desc:'',amount:500,mode:'Credit'}];
    creditPayments=[{id:'cp1',customerId:'c1',date:fmtDate(new Date()),amount:500,mode:'Cash'}];
    saveStaff(); saveExpense(); saveSales(); renderAll();`).catch(e=>errs.push('seed '+e.message));
  const r = JSON.parse(await E(p, `JSON.stringify({ravi:salaryFor(staffById('a'),'2026-09').paid, rk:salaryFor(staffById('b'),'2026-09').paid})`));
  assert(r.ravi === 4000 && r.rk === 15000, 'Ravi and Ravi Kumar payments kept apart (Ravi '+r.ravi+', Ravi Kumar '+r.rk+')');
  assert(await E(p, `cashMovement(fmtDate(new Date())).inflow`) === 500, 'udhaar paid back in cash adds to counter');
  // edit keeps staffId / advance flag
  await E(p, `expenses.push({id:'e3',staffId:'a',advance:true,date:'2026-10-10',category:'Staff Salary',description:'Ravi - advance October 2026',amount:1000,mode:'Cash'}); saveExpense();`);
  await E(p, `openForm('expense', expenses.find(function(x){return x.id==='e3';}), '2026-10-10')`); await p.fill('#f_amount','1200'); await p.click('#f_save'); await p.waitForTimeout(200);
  const e3 = JSON.parse(await E(p, `JSON.stringify(expenses.find(function(x){return x.id==='e3';}))`));
  assert(e3.staffId === 'a' && e3.advance === true && e3.amount === 1200, 'editing an advance keeps its staff link and advance flag');
  // rename keeps old payments
  await E(p, `openStaffForm('a')`); await p.fill('#s_name', 'Ravi Paswan'); await p.click('#s_save'); await p.waitForTimeout(200);
  assert(await E(p, `salaryFor(staffById('a'),'2026-09').paid`) === 4000 && await E(p, `salaryFor(staffById('b'),'2026-09').paid`) === 15000, 'renaming keeps their September payment');
  // new payment via settlement has staffId
  await E(p, `openSettlement(staffById('b'),'2026-10')`); await E(p, `(function(){ var r=document.querySelector('input[name="st_ch"][value="pay"]'); if(r){ r.checked=true; r.dispatchEvent(new Event('change')); } })()`); await p.fill('#st_amt','100'); await p.click('#st_go'); await p.waitForTimeout(200); await p.click('#dlgBtns button').catch(()=>{});
  assert(await E(p, `expenses.filter(function(x){return x.staffId==='b';}).length`) === 1, 'settlement payment carries staff link');
  // PDF report + slip
  const dl1 = p.waitForEvent('download', { timeout: 8000 }).catch(()=>null);
  await E(p, `openReportsSheet()`); await p.click('#rpAll'); await p.click('#rpGo'); const d1 = await dl1; await p.waitForTimeout(500);
  console.log('   report download:', d1 ? d1.suggestedFilename() : 'none (may use share sheet)');
  console.log('   dialog after report: ' + (await p.evaluate(() => document.getElementById('dlgBg').classList.contains('on') ? document.getElementById('dlgMsg').textContent : 'none'))); await p.click('#dlgBtns button').catch(()=>{});
  await E(p, `closeForm(); openSalarySlip(staffById('b'),'2026-09')`); await p.waitForTimeout(200);
  const dl2 = p.waitForEvent('download', { timeout: 8000 }).catch(()=>null);
  await p.click('#sp_pdf'); const d2 = await dl2; await p.waitForTimeout(300);
  console.log('   slip download:', d2 ? d2.suggestedFilename() : 'none');
  assert(d1 && d2, 'PDF report and salary slip are created');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
