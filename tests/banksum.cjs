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
  await E(p, `PARTNERS=['Rishabh']; savePartners(); investments=[]; creditPayments=[]; cashDays=[];
    settings.bankBalance=50000; settings.bankDate='2026-11-01'; saveSettings();
    sales=[{id:'u1',date:'2026-11-12',customer:'W',amount:3000,mode:'UPI'},{id:'u2',date:'2026-11-12',customer:'W',amount:500,mode:'Card'},{id:'c1',date:'2026-11-12',customer:'W',amount:900,mode:'Cash'}];
    purchases=[{id:'p1',date:'2026-11-12',vendor:'Kirana',item:'Milk',qty:10,unit:'L',rate:60,gst:0,mode:'UPI',paidBy:'Cafe UPI/bank'}];
    expenses=[{id:'e1',date:'2026-11-12',category:'Electricity',amount:1500,mode:'UPI',paidBy:'Cafe UPI/bank'},{id:'e2',date:'2026-11-12',category:'Bank charges',amount:59,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'}];
    cashMoves=[{id:'d1',date:'2026-11-12',holder:'Rishabh',type:'bank',amount:2000}];
    saveEverything(); renderAll(); openCalendarOn('2026-11-12');`);
  await p.waitForTimeout(400);
  const card = (await p.evaluate(() => [...document.querySelectorAll('#dayPanel .cashday')][1].innerText)).replace(/\s+/g,' ');
  console.log('   card: ' + card);
  assert(/Opening bank balance ?₹50,000/.test(card) && /\+ UPI \/ card sales ?₹3,500/.test(card) && /\+ Handover cash deposited ?₹2,000/.test(card), 'card: opening and money in');
  assert(/− Paid from bank ?₹2,159/.test(card) && /Bills paid ?₹1,500/.test(card) && /Purchases paid ?₹600/.test(card) && /Bank charges ?₹59/.test(card), 'card: paid from bank, with breakdown');
  assert(/Should be in bank ?₹53,341/.test(card), 'should be in bank = 50,000 + 5,500 - 2,159');
  await p.click('#dp_bank'); await p.waitForTimeout(200);
  assert(!(await p.isVisible('#bc_result')), 'result hidden until a balance is typed');
  await p.fill('#bc_amt', '53000'); await p.waitForTimeout(100);
  const res = (await p.textContent('#bc_result')).replace(/\s+/g,' ');
  assert(/Should be in bank ?₹53,341/.test(res) && /Bank app shows ?₹53,000/.test(res) && /Difference ?-₹341 less/.test(res), 'after typing: should be / app shows / difference');
  await p.screenshot({ path: process.env.S + '/bankform.png', fullPage: true });
  await p.fill('#bc_amt', '53341'); await p.waitForTimeout(100);
  assert(/Tallies/.test(await p.textContent('#bc_result')), 'tallies when equal');
  await p.click('#bc_save'); await p.waitForTimeout(300);
  // a day with nothing in or out
  await E(p, `openCalendarOn('2026-11-13')`); await p.waitForTimeout(300);
  const c2 = (await p.evaluate(() => [...document.querySelectorAll('#dayPanel .cashday')][1].innerText)).replace(/\s+/g,' ');
  assert(/Opening bank balance ?₹53,341/.test(c2) && /Money in \(UPI \/ card sales…\) ?₹0/.test(c2) && /Paid from bank ?₹0/.test(c2), 'quiet day: opening carries from the check, zeros shown');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
