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
  const dis = () => p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  await E(p, `staff=[{id:'stA',name:'Ravi',role:'Cook',defaultShift:'Morning',salary:15000,houseRent:2000,foodAllowance:60,foodBasis:'day',travelAllowance:0,joinDate:'2025-01-01',status:'Active',phone:''},
                     {id:'stB',name:'Sita',role:'Cashier',defaultShift:'Evening',salary:12000,houseRent:0,foodAllowance:1000,travelAllowance:0,joinDate:'2025-01-01',status:'Active',phone:''}];
    attendance=[{id:'a1',date:'2026-10-10',staffId:'stA',status:'Absent'}]; payroll=[]; roster=[]; expenses=[];
    saveStaff(); saveAttend(); savePayroll(); saveRoster(); saveExpense(); renderAll();`);
  let r = await E(p, `(function(){ var s = salaryFor(staffById('stA'),'2026-10'); return {net:s.net, food:s.allow.food, rent:s.allow.rent, extra:s.extraLeave, paid:s.extraPaid, choice:s.choice, worked:s.workedDays}; })()`);
  assert(r.choice==='ask' && r.paid===0 && r.extra===500, 'unused leave waits for a choice (no auto pay / goodwill): '+JSON.stringify(r));
  assert(r.food===1800 && r.rent===2000 && r.worked===30 && r.net===18800, 'food per day worked 30 x 60, rent monthly: '+JSON.stringify(r));
  await E(p, `setLeaveChoice(staffById('stA'),'2026-10','pay')`);
  assert(await E(p, `salaryFor(staffById('stA'),'2026-10').net`)===19300, 'pay extra adds 500');
  await E(p, `setLeaveChoice(staffById('stA'),'2026-10','waived')`);
  assert(await E(p, `salaryFor(staffById('stA'),'2026-10').net`)===18800 && await E(p, `goodwillFor(staffById('stA')).balance`)===500, 'goodwill only when chosen');
  // Salary tab: Edit month sheet
  await E(p, `showView('staff'); switchStaffSub('salary'); salMonth='2026-10'; renderSalaryView();`);
  let t = await p.textContent('#salaryView');
  assert(/Earnings/.test(t) && /Food 30 days × ₹60/.test(t) && /kept as goodwill/.test(t), 'salary card earnings layout');
  await p.click('[data-sledit="stA"]');
  await p.fill('#sm_rent', '2500');
  await p.click('#sm_addline'); await p.fill('.sm_al[data-i="0"]', 'Overtime'); await p.fill('.sm_aa[data-i="0"]', '1000');
  await p.click('#sm_addline'); await p.fill('.sm_al[data-i="1"]', 'Broken glass'); await p.selectOption('.sm_at[data-i="1"]', 'ded'); await p.fill('.sm_aa[data-i="1"]', '200');
  await p.click('#sm_save');
  r = await E(p, `(function(){ var a = salaryFor(staffById('stA'),'2026-10'), b = salaryFor(staffById('stA'),'2026-09'); return {oct:a.net, rent:a.allow.rent, adj:a.adj, sepRent:b.allow.rent}; })()`);
  assert(r.rent===2500 && r.sepRent===2000 && r.adj===800 && r.oct===18800+500+800, 'month-only rent + one-off lines: '+JSON.stringify(r));
  // From-this-month-on scope for September keeps August
  await E(p, `salMonth='2026-09'; renderSalaryView();`);
  await p.click('[data-sledit="stB"]'); await p.fill('#sm_food','1500'); await p.selectOption('#sm_scope','from'); await p.click('#sm_save');
  r = await E(p, `[salaryFor(staffById('stB'),'2026-08').allow.food, salaryFor(staffById('stB'),'2026-09').allow.food, salaryFor(staffById('stB'),'2026-10').allow.food]`);
  assert(r[0]===1000 && r[1]===1500 && r[2]===1500, 'from-month allowance keeps earlier months: '+r);
  // Settlement needs an explicit unused-leave choice (Sita, Sep: no leave taken -> 2 unused)
  await p.click('[data-slsettle="stB"]');
  await p.click('#st_go');
  assert(/Choose what to do with the unused leave/.test(await p.textContent('#st_err')), 'settlement asks for unused leave choice');
  await p.check('input[name="st_ch"][value="none"]'); await p.fill('#st_amt',''); await p.click('#st_go'); await dis();
  r = await E(p, `(function(){ var s = salaryFor(staffById('stB'),'2026-09'); return {st:s.status, net:s.net}; })()`);
  assert(r.st==='settled' && r.net===13500, 'settled without paying unused leave: '+JSON.stringify(r));
  // Undo keeps one-off lines
  await E(p, `salMonth='2026-10'; renderSalaryView(); openSettlement(staffById('stA'),'2026-10')`);
  await p.check('input[name="st_ch"][value="pay"]'); await p.selectOption('#st_round','exact'); await p.fill('#st_amt',''); await p.click('#st_go'); await dis();
  await E(p, `openUndoSalarySettlement(payrollFor('stA','2026-10'))`); await p.click('#us_go'); await dis();
  r = await E(p, `(function(){ var s = salaryFor(staffById('stA'),'2026-10'); return {st:s.status, adj:s.adj, ch:s.choice}; })()`);
  assert(r.st!=='settled' && r.adj===800 && r.ch==='ask', 'undo keeps one-off lines, clears choice: '+JSON.stringify(r));
  // Payslip
  await E(p, `openSalarySlip(staffById('stA'),'2026-10')`);
  t = await p.textContent('#sheet');
  assert(/Payslip · October 2026/.test(t) && /Gross earnings/.test(t) && /Overtime/.test(t) && /Broken glass/.test(t) && /Loss of pay|No deductions/.test(t) && /Rupees Twenty Thousand One Hundred Only/.test(t), 'payslip on screen: '+t.slice(0,200));
  await p.screenshot({ path: process.env.S + '/payslip_screen.png', fullPage:false });
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null); await p.click('#sp_pdf'); const d = await dl;
  if(d) await d.saveAs(process.env.S + '/payslip.pdf');
  assert(!!d, 'payslip pdf downloaded');
  assert(await E(p, `amountInWords(1250000.5)`)==='Rupees Twelve Lakh Fifty Thousand and Fifty Paise Only', 'amount in words (lakh)');
  // Roster
  await E(p, `closeForm(); staffDate='2026-11-23'; switchStaffSub('roster');`);
  t = await p.textContent('#rosterView');
  assert(/Morning · 8am - 4pm/.test(t) && /Evening · 4pm - 12am/.test(t) && !/Night/.test(t), 'two shifts by default');
  const cell = '[data-rc="stA"][data-rd="2026-11-23"]';
  await p.click(cell); assert(await E(p,`rosterShiftsOf('stA','2026-11-23').join()`)==='Morning', 'tap 1 -> Morning');
  await p.click(cell); assert(await E(p,`rosterShiftsOf('stA','2026-11-23').join()`)==='Evening', 'tap 2 -> Evening');
  await p.click(cell); assert(await E(p,`rosterShiftsOf('stA','2026-11-23').sort().join()`)==='Evening,Morning', 'tap 3 -> both');
  await p.click(cell); assert(await E(p,`rosterShiftsOf('stA','2026-11-23').length`)===0, 'tap 4 -> off');
  await p.click('#rw_fill'); await dis();
  r = await E(p, `[roster.filter(function(x){return x.staffId==='stA'&&x.shift==='Morning';}).length, roster.filter(function(x){return x.staffId==='stB'&&x.shift==='Evening';}).length]`);
  assert(r[0]===7 && r[1]===7, 'fill week with usual shifts: '+r);
  await E(p, `closeForm && closeForm(); staffDate='2026-11-30'; renderStaffSection();`);
  await p.click('#rw_copy'); await dis();
  assert(await E(p, `roster.filter(function(x){return x.date>='2026-11-30'&&x.date<='2026-12-06';}).length`)===14, 'copy last week');
  t = await p.textContent('#rosterView');
  assert(/Morning cover/.test(t), 'cover rows');
  await E(p, `staffDate='2026-11-23'; renderStaffSection(); window.scrollTo(0,0)`);
  await p.screenshot({ path: process.env.S + '/roster_week.png' });
  await p.click('#ros_edit'); await p.fill('.shn[data-i="0"]','Day'); await p.fill('.sht[data-i="0"]','9am - 5pm'); await p.click('#sh_save');
  r = await E(p, `[roster.filter(function(x){return x.shift==='Morning';}).length, roster.filter(function(x){return x.shift==='Day';}).length, staffById('stA').defaultShift]`);
  assert(r[0]===0 && r[1]===14 && r[2]==='Day', 'renaming a shift updates roster + usual shift: '+r);
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
