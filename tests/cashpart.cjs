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
  await E(p, `settings.openingCash=1000; settings.openingCashDate='2026-07-01'; saveSettings && saveSettings();
    sales=[{id:'s1',date:'2026-07-10',customer:'Walk-in',desc:'a',amount:2000,mode:'Cash'},{id:'s2',date:'2026-08-05',customer:'Walk-in',desc:'c',amount:900,mode:'Cash'}];
    purchases=[{id:'p1',date:'2026-07-10',vendor:'V1',item:'Milk',qty:1,unit:'L',rate:300,gst:0,mode:'Cash',paidBy:'Cafe cash'}];
    expenses=[];
    cashDays=[{id:'c1',date:'2026-07-10',counted:2600,floatLeft:500,receivedBy:PARTNERS[0],incharge:'Ram'}];
    investments=[{id:'i1',date:'2026-07-20',partner:PARTNERS[0],invType:'Loan',amount:2000,mode:'UPI',via:'bank'},
                 {id:'i2',date:'2026-08-03',partner:PARTNERS[0],invType:'Loan repayment',amount:500,mode:'UPI',via:'bank'},
                 {id:'i3',date:'2026-07-02',partner:PARTNERS[0],invType:'Investment',purpose:'Equipment / furniture',amount:10000,via:'direct'}];
    saveEverything(); setAppMonth('2026-07'); recPeriod='month'; renderAll(); showView('records'); switchRecordsSub('cash');`);
  let t = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  assert(/July 2026/.test(t) && /Cash sales ?₹2,000/.test(t), 'cash month KPI: '+t.slice(0,300));
  assert(/₹100 short · ₹0 extra/.test(t), 'short by 100 (expected 2700, counted 2600)');
  assert(/Counter log · July 2026/.test(t) && /Ram/.test(t), 'month counter log');
  assert(/Cash handed over · July 2026/.test(t), 'handover for period');
  assert(/Opening balances/.test(t), 'opening balances still there');
  // day view of 10 Jul shows that day's counter
  await p.click('#cashView [data-rper="day"]');
  await E(p, `setAppDate('2026-07-10'); renderAll();`);
  t = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  assert(/Fri, 10 Jul/.test(t) && /Should be in counter ?₹2,700/.test(t) && /Update count for 10 Jul/.test(t), 'day counter card');
  // year view
  await p.click('#cashView [data-rper="year"]');
  t = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  assert(/Month by month/.test(t) && /July 2026/.test(t) && /August 2026/.test(t), 'cash year rows');
  await p.click('#cashView [data-rpmonth="2026-08"]');
  assert(await E(p,'appMonth()')==='2026-08' && await E(p,'recPeriod')==='month', 'year row opens month');
  // partners
  await p.click('#recCtl [data-r="partners"]');
  await E(p, `setAppMonth('2026-07'); renderAll();`);
  t = (await p.textContent('#partnersView')).replace(/\s+/g,' ');
  assert(/In July 2026/.test(t) && /Loan to the cafe ?₹2,000/.test(t) && /Capital put in ?₹10,000/.test(t), 'partner July activity');
  assert(/as at 31 Jul/.test(t) && /Outstanding ?₹2,000/.test(t), 'balance as at July end');
  assert(/Partners put in ?₹12,000/.test(t), 'partners KPI');
  await p.click('#partnersView [data-rpshift="1"]');
  t = (await p.textContent('#partnersView')).replace(/\s+/g,' ');
  assert(/In August 2026/.test(t) && /Loan repaid by the cafe ?₹500/.test(t) && /Outstanding ?₹1,500/.test(t), 'partner August: repaid, 1,500 left');
  assert(/August 2026 · /.test(await p.textContent('#recordsTotalLbl')), 'partners header');
  await p.click('#partnersView [data-rper="year"]');
  t = (await p.textContent('#partnersView')).replace(/\s+/g,' ');
  assert(/Month by month/.test(t) && /as at today/.test(t), 'partner year view');
  await E(p, `recPeriod='month'; setAppMonth('2026-07'); renderAll(); switchRecordsSub('partners'); window.scrollTo(0,0)`);
  await p.screenshot({ path: process.env.S + '/partners_month.png' });
  await E(p, `switchRecordsSub('cash'); window.scrollTo(0,0)`);
  await p.screenshot({ path: process.env.S + '/cash_month.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
