const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs, { viewport:{ width:400, height:860 } });
  await E(p, `sales=[{id:'s1',date:'2026-07-10',customer:'Walk-in',desc:'a',amount:500,mode:'UPI'},{id:'s2',date:'2026-07-10',customer:'Amit',desc:'b',amount:300,mode:'Credit'},
     {id:'s3',date:'2026-08-05',customer:'Walk-in',desc:'c',amount:900,mode:'Cash'},{id:'s4',date:'2025-12-31',customer:'Old',desc:'d',amount:100,mode:'Cash'}];
    purchases=[{id:'p1',date:'2026-07-11',vendor:'V1',item:'Milk',qty:1,unit:'L',rate:60,gst:0,mode:'Cash',paidBy:'Cafe cash'},{id:'p2',date:'2026-08-06',vendor:'V2',item:'Tea',qty:1,unit:'kg',rate:200,gst:0,mode:'Credit',paidBy:'Cafe cash'}];
    expenses=[{id:'e1',date:'2026-07-31',category:'Rent',description:'Rent',amount:3000,mode:'UPI',paidBy:'Cafe UPI/bank'},{id:'e2',date:'2026-08-02',category:'Gas',description:'cyl',amount:900,mode:'Cash',paidBy:'Cafe cash'}];
    investments=[{id:'i1',date:'2026-07-20',partner:PARTNERS[0],invType:'Loan',amount:2000,mode:'UPI',via:'bank'}];
    saveEverything(); setAppMonth('2026-07'); recPeriod='month'; renderAll(); showView('records'); switchRecordsSub('sales');`);
  let t = await p.textContent('#salesList');
  assert(/July 2026/.test(t) && /Amit/.test(t) && !/Old/.test(t) && !/₹900/.test(t), 'month view shows only July sales');
  assert(/Udhaar/.test(t), 'mode breakdown shows udhaar');
  assert(/July 2026 · ₹800/.test(await p.textContent('#recordsTotalLbl')), 'header total for month');
  // next month syncs every tab and the calendar
  await p.click('#salesList [data-rpshift="1"]');
  t = await p.textContent('#salesList');
  assert(/August 2026/.test(t) && /₹900/.test(t) && !/Amit/.test(t), 'next month');
  const st = await E(p, `({cal: appMonth(), fc: fcMonth, ho: hoMonth, ln: lnMonth, bk: bkMonth, cr: crMonth, sel: selectedDate, title: document.getElementById('calTitle').textContent})`);
  assert(st.cal==='2026-08' && st.fc==='2026-08' && st.ho==='2026-08' && st.ln==='2026-08' && st.bk==='2026-08' && st.cr==='2026-08' && st.sel.slice(0,7)==='2026-08' && /August/.test(st.title), 'all tabs + calendar on August: '+JSON.stringify(st));
  await p.click('#recCtl [data-r="purchases"]');
  t = await p.textContent('#purchList');
  assert(/August 2026/.test(t) && /V2/.test(t) && !/V1/.test(t), 'purchases follow the same month');
  await p.click('#recCtl [data-r="expenses"]');
  t = await p.textContent('#expenseList');
  assert(/Gas/.test(t) && !/Rent/.test(t), 'expenses follow');
  // year view: month rows; tap opens month
  await p.click('#expenseList [data-rper="year"]');
  t = await p.textContent('#expenseList');
  assert(/Month by month/.test(t) && /July 2026/.test(t) && /August 2026/.test(t), 'year view month rows');
  await p.click('#expenseList [data-rpmonth="2026-07"]');
  t = await p.textContent('#expenseList');
  assert(/Rent/.test(t) && !/Gas/.test(t) && await E(p,'recPeriod')==='month', 'tap month opens it');
  // day view: tap a day header in Sales
  await p.click('#recCtl [data-r="sales"]');
  await p.click('#salesList [data-rpday="2026-07-10"]');
  t = await p.textContent('#salesList');
  assert(await E(p,'recPeriod')==='day' && /Amit/.test(t) && /Add sale on 10 Jul/.test(t), 'day view');
  await p.click('#salesList [data-rpshift="1"]');
  assert(await E(p,'selectedDate')==='2026-07-11' && /No sales/.test(await p.textContent('#salesList')), 'next day, empty');
  // calendar day click updates records day view
  await E(p, `showView('calendar')`);
  await p.click('#calGrid [data-date="2026-07-10"]');
  assert(/Amit/.test(await p.textContent('#salesList')), 'calendar day drives records');
  // calendar month nav moves loans / bank too
  await p.click('#calNext');
  const st2 = await E(p, `({ln: lnMonth, bk: bkMonth, sel: selectedDate})`);
  assert(st2.ln==='2026-08' && st2.bk==='2026-08' && st2.sel.slice(0,7)==='2026-08', 'calendar nav syncs');
  const glance = await p.textContent('#calMonth');
  assert(/August 2026 at a glance/.test(glance) && /₹900/.test(glance), 'calendar month card');
  await p.click('#calMonth [data-calrec="purchases"]');
  assert(await E(p,'recSub')==='purchases' && await E(p,'recPeriod')==='month', 'glance opens records');
  await p.click('#recCtl [data-r="sales"]');
  await E(p, `recPeriod='month'; setAppMonth('2026-07'); renderAll(); window.scrollTo(0,0)`);
  await p.screenshot({ path: process.env.S + '/records_month.png' });
  await p.click('#recCtl [data-r="loans"]');
  assert(/July 2026/.test(await p.textContent('#loansView')), 'loans on same month');
  await p.click('#lnNext');
  assert(await E(p,'appMonth()')==='2026-08' && await E(p,'crMonth')==='2026-08', 'loan nav syncs app');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
