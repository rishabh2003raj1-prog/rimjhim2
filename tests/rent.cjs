const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
// House rent switched on / off per month.
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  await E(p, `staff=[{id:'r1',name:'Ravi',role:'Cook',salary:12000,houseRent:2000,status:'Active',joinDate:'2026-01-01'},{id:'s1',name:'Sita',role:'Helper',salary:9000,houseRent:1500,rentMode:'monthly',status:'Active',joinDate:'2026-01-01'}];
    payroll=[]; saveStaff(); savePayroll(); salMonth=fmtDate(new Date()).slice(0,7); renderAll(); showView('staff'); switchStaffSub('salary');`);
  const M = await E(p, 'salMonth'), P = await E(p, `addDays(salMonth+'-01',-1).slice(0,7)`);
  const rent = (id, m) => E(p, `allowConfig(staffById('${id}'), '${m}').houseRent`);
  assert(await rent('r1', M)===2000 && await rent('s1', M)===0, 'every-month staff gets rent; only-when-on staff does not by default');
  const sw = await p.$$eval('.rentsw', a => a.map(x => x.textContent.replace(/\s+/g,' ')));
  assert(sw.length===2 && /Given ₹2,000/.test(sw[0]), 'switch on each salary card: '+JSON.stringify(sw));
  await p.click('[data-rent="r1"][data-on="0"]'); await p.waitForTimeout(150);
  assert(await rent('r1', M)===0 && await rent('r1', P)===2000, 'Ravi: not given this month only, last month unchanged');
  assert(await p.$('[data-rent="r1"][data-on="0"].off'), 'switch shows Not given');
  await p.click('[data-rent="s1"][data-on="1"]'); await p.waitForTimeout(150);
  const N = await E(p, `fmtDate(new Date(+salMonth.slice(0,4), +salMonth.slice(5,7), 1)).slice(0,7)`);
  assert(await rent('s1', M)===1500 && await rent('s1', N)===0, 'Sita: given this month, next month off again');
  const tot = await E(p, `salaryFor(staffById('r1'), salMonth).allowances`);
  assert(tot===0, 'Ravi allowances this month exclude rent: '+tot);
  // the staff form still shows the usual amount and keeps it
  await E(p, `openStaffForm('r1')`).catch(()=>{}); await p.waitForTimeout(200);
  if(await p.$('#s_rent')){
    assert(await p.inputValue('#s_rent')==='2000', 'staff form shows the usual rent (2000) even in an off month');
    assert(await p.inputValue('#s_rentmode')==='always', 'house rent given: every month');
    await p.click('#s_save'); await p.waitForTimeout(200);
    assert(await rent('r1', P)===2000 && await rent('r1', M)===0 && await E(p, `allowConfig(staffById('r1'), salMonth, true).rentBase`)===2000, 'saving the form keeps the usual amount and this month off');
  } else assert(false, 'staff form opened');
  // edit-month amount switches rent on for that month
  await E(p, `closeForm(); openSalaryMonthForm(staffById('r1'), salMonth)`); await p.fill('#sm_rent','1800'); await p.click('#sm_save'); await p.waitForTimeout(200);
  assert(await rent('r1', M)===1800, 'typing an amount in Edit month gives rent for that month');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
