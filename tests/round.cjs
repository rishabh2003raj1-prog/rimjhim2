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
  // 13,332.40: salary 14,285.43 isn't neat, so use a part month: 28 days of 14,285 = 13,332.67; use allowance to hit .40
  await E(p, `staff=[{id:'g1',name:'Gurfan',role:'Helper',salary:15000,status:'Active',joinDate:'2026-09-04'}];
    attendance=[]; payroll=[]; expenses=[{id:'e1',date:'2026-09-15',category:'Staff Salary',description:'Gurfan - salary September 2026',amount:3000,mode:'Cash'}];
    saveStaff(); saveAttend(); savePayroll(); saveExpense(); renderAll();`);
  const s0 = JSON.parse(await E(p, `JSON.stringify(salaryFor(staffById('g1'),'2026-09'))`));
  console.log('   exact due', s0.net, 'balance', s0.balance);  // 27 x 500 = 13,500
  await E(p, `openSettlement(staffById('g1'),'2026-09')`);
  // force an odd exact amount by a 0.4 allowance-like case: test with custom/rounding on 13,500 isn't interesting, so set salary to 14813.78
  await E(p, `closeForm(); staff[0].salary=14813.78; saveStaff(); openSettlement(staffById('g1'),'2026-09')`);
  const ex = await E(p, `salaryFor(staffById('g1'),'2026-09').net`); console.log('   exact', ex);
  await p.selectOption('#st_round', 'd10'); await p.waitForTimeout(100);
  console.log('   ' + (await p.textContent('#st_sum')));
  assert(/Total due₹13,330/.test(await p.textContent('#st_sum')) && await p.inputValue('#st_amt') === '10330', 'down to ₹10: 13,332.30 -> 13,330, pay 10,330');
  await p.selectOption('#st_round', 'r1'); assert(/Total due₹13,332/.test(await p.textContent('#st_sum')), 'nearest ₹1 -> 13,332');
  await p.selectOption('#st_round', 'custom'); await p.fill('#st_custom', '13000'); await p.click('#st_go'); await p.waitForTimeout(200);
  assert(/too big for a round off/.test(await p.textContent('#st_err')), 'big custom cut refused');
  await p.fill('#st_custom', '13325'); await p.click('#st_go'); await p.waitForTimeout(300);
  console.log('   ' + await p.textContent('#dlgMsg')); await p.click('#dlgBtns button');
  const s1 = JSON.parse(await E(p, `JSON.stringify(salaryFor(staffById('g1'),'2026-09'))`));
  assert(s1.net === 13325 && s1.balance === 0 && s1.status === 'settled', 'settled at 13,325, balance 0');
  assert(await E(p, `fixedMonthSummary('2026-09').staffRows[0].planned`) === 13325, 'Bills/fixed cost uses 13,325');
  await E(p, `salMonth='2026-09'; showView('staff'); switchStaffSub('salary');`); await p.waitForTimeout(200);
  assert(/Round off \(settlement\)−₹7\.3/.test((await p.textContent('#salaryView')).replace(/\s+/g,' ').replace(/ ?(−)/,'$1')) || /Round off/.test(await p.textContent('#salaryView')), 'salary card shows the round off');
  assert(JSON.stringify(await E(p, `slipData(salaryFor(staffById('g1'),'2026-09'))`)).includes('Round off'), 'slip shows round off');
  console.log('errors', errs); await b.close();
})();
