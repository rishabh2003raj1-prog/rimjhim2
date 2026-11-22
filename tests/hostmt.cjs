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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners(); sales=[]; purchases=[]; investments=[]; creditPayments=[];
    cashDays=[{id:'c0',date:'2026-09-28',counted:1500,floatLeft:0,receivedBy:'Dashrath Bhaiya'}];
    for(var d=1; d<=25; d++) cashDays.push({id:'c'+d,date:'2026-10-'+String(d).padStart(2,'0'),counted:2000+d*10,floatLeft:500,incharge:'Rohit',receivedBy:d%3?'Rishabh':'Dashrath Bhaiya'});
    expenses=[{id:'e1',date:'2026-10-06',category:'Electricity',description:'Electricity - October 2026',amount:800,mode:'Cash',paidBy:'Rishabh (cafe cash held)'}];
    cashMoves=[{id:'m1',date:'2026-10-05',holder:'Rishabh',type:'bank',amount:3000,note:'SBI slip 123'},
               {id:'m2',date:'2026-10-07',holder:'Rishabh',type:'pass',to:'Dashrath Bhaiya',amount:500},
               {id:'m3',date:'2026-10-09',holder:'Dashrath Bhaiya',type:'withdraw',amount:1000},
               {id:'m4',date:'2026-10-20',holder:'Rishabh',type:'bank',amount:20000}];
    saveEverything(); renderAll(); showView('records'); switchRecordsSub('handover'); hoMonth='2026-10'; renderHandoverView();`);
  const L = JSON.parse(await E(p, `JSON.stringify(handoverLedger('2026-10'))`));
  let dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null);
  await p.click('#ho_pdf'); let d = await dl;
  assert(!!d && /Handover_2026-10\.pdf$/.test(d.suggestedFilename()), 'all-people statement downloads: ' + (d && d.suggestedFilename()));
  if (d) await d.saveAs(process.env.S + '/ho_all.pdf');
  dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null);
  await p.click('[data-hopdf="Rishabh"]'); d = await dl;
  assert(!!d && /Handover_Rishabh_2026-10\.pdf$/.test(d.suggestedFilename()), 'one-person statement downloads: ' + (d && d.suggestedFilename()));
  if (d) await d.saveAs(process.env.S + '/ho_rishabh.pdf');
  require('fs').writeFileSync(process.env.S + '/ho_expect.json', JSON.stringify(L.map(r => ({h:r.holder, o:r.opening, c:r.closing}))));
  // bank statement still works after refactor
  await E(p, `switchRecordsSub('bank'); bkMonth='2026-10'; renderBankView();`);
  dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null);
  await p.click('#bk_pdf'); d = await dl;
  assert(!!d, 'bank statement still downloads');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
