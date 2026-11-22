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
  await E(p, `sales=[]; [['19',590],['23',410],['24',890],['25',1573],['26',1070]].forEach(function(x,i){ sales.push({id:'s'+i,date:'2026-07-'+x[0],customer:'Walk-in',desc:'Counter Sales',amount:x[1],mode:'UPI'}); });
    sales.push({id:'c1',date:'2026-07-25',customer:'Walk-in',desc:'counter sales',amount:1500,mode:'Cash'});
    purchases=[{id:'p1',date:'2026-07-20',vendor:'Rihan shop',item:'Milk',qty:10,unit:'L',rate:60,gst:0,mode:'Cash',paidBy:'Cafe cash'}];
    expenses=[{id:'e1',date:'2026-07-31',category:'Rent',description:'Rent - July 2026',amount:1,mode:'UPI',paidBy:'Cafe UPI/bank'}];
    saveEverything(); renderAll();`);
  await E(p, `reportState.preset='custom'; reportState.from='2026-07-01'; reportState.to='2026-07-31'; openReportsSheet();`).catch(()=>{});
  await p.fill('#rpFrom','2026-07-01').catch(()=>{}); await p.fill('#rpTo','2026-07-31').catch(()=>{});
  await p.click('#rpAll');
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null); await p.click('#rpGo'); const d = await dl;
  if (d) await d.saveAs(process.env.S + '/report_jul.pdf');
  assert(!!d, 'report generated');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
