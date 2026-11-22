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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners();
    sales=[{id:'s1',date:'2026-10-10',customer:'W',amount:90000,mode:'UPI'}]; purchases=[]; expenses=[{id:'e1',date:'2026-10-13',category:'Rent',amount:30000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'}];
    cashMoves=[{id:'w1',date:'2026-10-25',holder:'Dashrath Bhaiya',type:'withdraw',amount:2000,note:'Diwali'}];
    investments=[{id:'a',date:'2026-07-01',partner:'Rishabh',invType:'Investment',purpose:'Shop purchase',amount:300000,mode:'Bank Transfer',via:'direct'},
                 {id:'b',date:'2026-07-01',partner:'Dashrath Bhaiya',invType:'Investment',purpose:'Shop purchase',amount:300000,mode:'Bank Transfer',via:'direct'},
                 {id:'c',date:'2026-07-05',partner:'Dashrath Bhaiya',invType:'Investment',purpose:'Shop renovation / interiors',amount:80000,mode:'Cash',via:'direct',notes:'Carpenter + paint'},
                 {id:'d',date:'2026-07-20',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:40000,mode:'UPI',via:'bank'},
                 {id:'e',date:'2026-09-01',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:10000,mode:'Cash',via:'counter'},
                 {id:'f',date:'2026-10-20',partner:'Rishabh',invType:'Loan repayment',purpose:'Working capital',amount:15000,mode:'UPI',via:'bank',notes:'from Oct profit'}];
    saveEverything(); renderAll(); showView('records'); switchRecordsSub('partners');`);
  let dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null);
  await p.click('#pm_pdf'); let d = await dl;
  assert(!!d && /Partner_Statement_\d{4}-\d\d-\d\d\.pdf$/.test(d.suggestedFilename()), 'all-partner statement: ' + (d && d.suggestedFilename()));
  if (d) await d.saveAs(process.env.S + '/pm_all.pdf');
  dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null);
  await p.click('[data-ppdf="Rishabh"]'); d = await dl;
  assert(!!d && /Partner_Statement_Rishabh_/.test(d.suggestedFilename()), 'one-partner statement: ' + (d && d.suggestedFilename()));
  if (d) await d.saveAs(process.env.S + '/pm_rishabh.pdf');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
