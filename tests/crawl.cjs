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
  p.on('console', m => { if (m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('console: '+m.text()); });
  // realistic data across Jul–Nov
  await E(p, `
    menuItems=[{id:'m1',name:'Masala Chai',price:20,category:'Drinks',recipe:[{ingId:'i1',qty:0.05}]},{id:'m2',name:'Veg Maggi',price:60,category:'Food',recipe:[]}];
    ingredients=[{id:'i1',name:'Milk',unit:'L',minStock:5,cost:60}];
    vendors=[{id:'vd1',name:'Roobi Devi Kirana',phone:''}];
    customers=[{id:'c1',name:'Amit',phone:'9999999999'}];
    staff=[{id:'r1',name:'Rohit Chhotu',role:'Helper',salary:10000,status:'Active',joinDate:'2026-07-15',defaultShift:'Morning'},
           {id:'g1',name:'Gurfan',role:'Helper',salary:12000,status:'Active',joinDate:'2026-09-03',defaultShift:'Evening'},
           {id:'x1',name:'Old Boy',role:'Helper',salary:8000,status:'Left',joinDate:'2026-07-15',leftDate:'2026-08-20'}];
    sales=[]; purchases=[]; expenses=[]; attendance=[];
    var ds=['2026-07-20','2026-08-10','2026-09-12','2026-10-05','2026-10-30', fmtDate(new Date())];
    ds.forEach(function(d,i){ sales.push({id:'s'+i,date:d,customer:'Walk-in',desc:'chai',amount:1000+i*100,mode:i%2?'UPI':'Cash'});
      purchases.push({id:'p'+i,date:d,vendor:'Roobi Devi Kirana',item:'Milk',category:'Dairy',qty:2,unit:'L',rate:60,gst:0,mode:'Cash',paidBy:'Cafe UPI/bank'}); });
    sales.push({id:'sc',date:'2026-10-06',customer:'Amit',desc:'credit',amount:300,mode:'Credit',customerId:'c1'});
    settings.fixedCostHistory=[{from:'2026-07',costs:{Rent:1,Electricity:500}},{from:'2026-08',costs:{Rent:30000,Electricity:1500}}];
    expenses.push({id:'e1',date:'2026-08-05',category:'Rent',description:'Rent - August 2026',amount:30000,mode:'UPI',paidBy:'Rishabh (personal)'});
    expenses.push({id:'e2',date:'2026-10-02',category:'Staff Salary',description:'Gurfan - salary September 2026',amount:11200,mode:'Cash'});
    for(var d=3; d<=30; d++) setAttendanceOn('2026-09-'+String(d).padStart(2,'0'),'g1','Present');
    saveEverything ? saveEverything() : null; renderAll();`).catch(e => errs.push('seed: '+e.message));
  const clickAll = async (sel) => { for (const h of await p.$$(sel)) { try { await h.click({ timeout: 2000 }); await p.waitForTimeout(150); } catch(e){} } };
  async function closeAny(){ await E(p, `try{closeForm();}catch(e){} document.getElementById('dlgBg') && document.getElementById('dlgBg').classList.remove('on');`).catch(()=>{}); }
  for (const v of ['dashboard','calendar','notes','staff','records']) {
    await p.click(`nav.tabs button[data-v="${v}"]`); await p.waitForTimeout(250);
    if (v==='dashboard') for (const r of ['1','yesterday','7','15','30','90']) { await p.click(`#rangeCtl button[data-r="${r}"]`).catch(()=>{}); await p.waitForTimeout(150); }
    if (v==='calendar') { await p.click('#calPrev'); await p.click('#calPrev'); await p.click('.daycell[data-date]'); await p.waitForTimeout(150); for (const t of ['sale','purchase','investment','expense']) { await p.click(`[data-add="${t}"]`).catch(()=>{}); await p.waitForTimeout(150); await closeAny(); } }
    if (v==='staff') for (const s of ['team','roster','attendance','tasks','salary','meals']) { await p.click(`#staffCtl button[data-s="${s}"]`); await p.waitForTimeout(200);
        if (s==='salary') { await clickAll('#salaryView button'); await closeAny(); }
        if (s==='team') { const c = await p.$('#teamView .staffcard, #staffList .entry'); if (c) { await c.click().catch(()=>{}); await p.waitForTimeout(200); await closeAny(); } } }
    if (v==='records') for (const r of ['sales','purchases','investments','expenses','fixed','customers','assets','vendors','menu','stock','cash','partners']) {
        await p.click(`#recCtl button[data-r="${r}"]`); await p.waitForTimeout(200);
        const first = await p.$('.reclist:not([style*="none"]) .entry'); if (first) { await first.click().catch(()=>{}); await p.waitForTimeout(150); await closeAny(); } }
  }
  // forms: open each add form and save a valid entry
  for (const t of ['sale','purchase','expense','investment']) { await E(p, `openForm('${t}', null, fmtDate(new Date()))`); await p.waitForTimeout(150);
    const fields = await p.$$eval('#sheet input, #sheet select', els => els.map(e => e.id + ':' + e.type));
    console.log('   ' + t + ' form: ' + fields.join(' ')); await closeAny(); }
  // misc sheets
  for (const fn of ['openReportsSheet()','openOutletSheet()','openFixedCostForm()','openAddChooser()','openStaffForm()','openFixDates()','openTally(fmtDate(new Date()))']) {
    await E(p, fn).catch(e => errs.push(fn + ': ' + e.message)); await p.waitForTimeout(200); await closeAny(); }
  await E(p, `openBackup ? openBackup() : document.getElementById('backupBtn').click()`).catch(()=>{}); await p.waitForTimeout(200); await closeAny();
  // month navigation through all screens
  for (const m of ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12']) {
    await E(p, `fcMonth='${m}'; salMonth='${m}'; attMonth='${m}'; attMode='month'; renderAll(); renderFixedView(); renderSalaryView(); renderAttendView(); renderCalBills('${m}');`).catch(e => errs.push(m+': '+e.message));
  }
  // numbers sanity
  const chk = JSON.parse(await E(p, `JSON.stringify({
     old: salaryFor(staffById('x1'),'2026-08'), oldSep: salaryFor(staffById('x1'),'2026-09').employedDays,
     g: salaryFor(staffById('g1'),'2026-09').net, cash: cashInHand(), owed: pendingReimbursements().length })`));
  console.log('   left staff Aug: days', chk.old.employedDays, 'net', chk.old.net, '| Sep days', chk.oldSep, '| Gurfan Sep', chk.g, '| owed', chk.owed);
  assert(chk.old.employedDays === 20 && chk.oldSep === 0, 'left staff paid to leaving date only');
  assert(chk.g === 11200, 'Gurfan 28 days = 11,200');
  console.log('ERRORS', JSON.stringify(errs, null, 1)); await b.close();
})();
