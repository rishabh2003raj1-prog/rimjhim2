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
  await E(p, `sales=[{id:'s1',date:'2026-10-10',customer:'W',amount:10000,mode:'Cash'}];
    purchases=[{id:'p1',date:'2026-10-10',vendor:'V',item:'Milk',qty:10,unit:'L',rate:300,gst:0,mode:'Cash',paidBy:'Cafe cash'}];
    expenses=[{id:'e1',date:'2026-10-11',category:'Repairs',amount:2000,mode:'Cash',paidBy:'Cafe cash'}];
    cashMoves=[{id:'i1',type:'interest',date:'2026-10-31',amount:150.75,note:'Q3'},{id:'i2',type:'interest',date:'2026-09-30',amount:100}];
    saveSales(); savePurch(); saveExpense(); saveCashMoves(); customFrom='2026-10-01'; customTo='2026-10-31'; renderAll(); showView('dashboard');`);
  await p.waitForTimeout(300);
  const kpi = await p.textContent('#kpiNet'), pb = (await p.textContent('#profitBreak')).replace(/\s+/g,' ');
  console.log('   net', kpi, '|', pb);
  assert(/5,151|5,150\.75/.test(kpi), 'October net = 10,000 - 3,000 - 2,000 + 150.75 interest');
  assert(/Other income \(bank interest\) ?₹150\.75/.test(pb), 'profit breakdown shows other income');
  // a month without interest shows no line
  await E(p, `customFrom='2026-08-01'; customTo='2026-08-31'; renderDashboard();`);
  assert(!/Other income/.test(await p.textContent('#profitBreak')), 'no line when there is no interest');
  // PDF report
  await E(p, `reportState.preset='custom'; reportState.from='2026-10-01'; reportState.to='2026-10-31'; openReportsSheet();`).catch(()=>{});
  await p.fill('#rpFrom','2026-10-01').catch(()=>{}); await p.fill('#rpTo','2026-10-31').catch(()=>{});
  await p.click('#rpAll');
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(()=>null);
  await p.click('#rpGo'); const d = await dl;
  assert(!!d, 'PDF report still generates');
  if (d) { const fp = process.env.S + '/rep.pdf'; await d.saveAs(fp); const raw = require('fs').readFileSync(fp, 'latin1'); console.log('   pdf has "Other income":', /Other income/.test(raw)); }
  // outlet totals helper
  const items = {}; items['sales_v1']={value:[{date:fmtD0(),amount:1000,mode:'Cash'}]};
  function fmtD0(){ return new Date().toISOString().slice(0,10); }
  const net = await E(p, `monthTotalsFor({'sales_v1':{value:[{date:fmtDate(new Date()),amount:1000}]},'cashmoves_v1':{value:[{type:'interest',date:fmtDate(new Date()),amount:50}]}}).net`);
  assert(net === 1050, 'outlet month totals include interest');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
