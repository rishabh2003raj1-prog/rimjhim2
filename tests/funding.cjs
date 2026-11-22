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
  const r = await E(p, `(function(){
    var own = payerOptions().find(function(o){ return o.personal; });
    sales=[{id:'s1',date:'2026-07-10',customer:'Walk-in',desc:'x',amount:5000,mode:'UPI'},{id:'s2',date:'2026-07-12',customer:'Amit',desc:'x',amount:400,mode:'Credit'},
           {id:'s3',date:'2026-08-05',customer:'Walk-in',desc:'x',amount:9000,mode:'Cash'}];
    purchases=[{id:'p1',date:'2026-07-11',vendor:'V1',item:'Milk',qty:1,unit:'L',rate:6000,gst:0,mode:'Credit',paidBy:'Cafe cash'},
               {id:'p2',date:'2026-07-15',vendor:'V2',item:'Sugar',qty:1,unit:'kg',rate:1500,gst:0,mode:'Cash',paidBy:own.value},
               {id:'p3',date:'2026-08-06',vendor:'V2',item:'Tea',qty:1,unit:'kg',rate:2000,gst:0,mode:'UPI',paidBy:'Cafe UPI/bank'}];
    expenses=[{id:'e1',date:'2026-07-31',category:'Rent',description:'Rent',amount:3000,mode:'UPI',paidBy:'Cafe UPI/bank'}];
    investments=[{id:'i1',date:'2026-07-20',partner:own.partner,invType:'Loan',amount:2000,mode:'UPI',via:'bank'},
                 {id:'i2',date:'2026-07-02',partner:own.partner,invType:'Investment',purpose:'Shop renovation / interiors',amount:50000,via:'direct'},
                 {id:'i3',date:'2026-08-10',partner:own.partner,invType:'Loan repayment',amount:1000,mode:'UPI',via:'bank'}];
    loans=[{id:'l1',date:'2026-07-21',type:'take',party:'Uncle',partyType:'Relative / friend',amount:3000,via:'counter'}];
    creditPayments=[{id:'c1',customerId:'x',date:'2026-08-03',amount:400,mode:'Cash'}];
    saveEverything(); renderAll();
    var fm = monthFunding('2026-07-01','2026-08-31');
    return fm.map(function(m){ return {m:m.month,net:m.net,loans:m.loans,partner:m.partner,timing:m.timing,change:m.change,dc:m.directCapital,story:m.story}; });
  })()`);
  console.log(JSON.stringify(r,null,1));
  // July: net = 5400 - 7500 - 3000 = -5100; timing = -400 + 6000 = 5600; partner = +1500; loans = 2000+3000=5000; change = 7000
  assert(r[0].net===-5100 && r[0].timing===5600 && r[0].partner===1500 && r[0].loans===5000 && r[0].change===7000 && r[0].dc===50000, 'July figures');
  // Aug: net = 9000-2000=7000; timing +400; loans -1000; change 6400
  assert(r[1].net===7000 && r[1].timing===400 && r[1].loans===-1000 && r[1].change===6400, 'Aug figures');
  await E(p, `reportState.preset='custom'; reportState.from='2026-07-01'; reportState.to='2026-08-31'; openReportsSheet();`);
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null); await p.click('#rpFund'); const d = await dl;
  if (d) await d.saveAs(process.env.S + '/funding.pdf');
  assert(!!d, 'funding pdf generated');
  await E(p, `showReportOnScreen({from:'2026-07-01',to:'2026-08-31',label:'Custom'}, ['summary','funding'])`);
  await p.screenshot({ path: process.env.S + '/funding_screen.png', fullPage: false });
  const txt = await p.textContent('.rpscreen');
  assert(/How the cafe met its needs/.test(txt) && /Loan from Uncle/.test(txt) && /Kept going with/.test(txt), 'screen shows funding');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
