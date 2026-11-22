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
    settings.bankBalance=50000; settings.bankDate='2026-10-01'; settings.bankReviewed={'2026-10':'2026-11-02'}; saveSettings();
    sales=[]; for(var d=1; d<=28; d++) sales.push({id:'s'+d,date:'2026-10-'+String(d).padStart(2,'0'),customer:'W',amount:1000+d*37.5,mode:'UPI'});
    creditPayments=[{id:'cp',customerId:'c1',date:'2026-10-12',amount:400,mode:'UPI'}]; customers=[{id:'c1',name:'Amit'}];
    investments=[{id:'i1',date:'2026-10-03',partner:'Rishabh',invType:'Investment',amount:20000,mode:'Bank Transfer'}];
    expenses=[{id:'e1',date:'2026-10-05',category:'Rent',description:'Rent - October 2026',amount:30000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'},
              {id:'e2',date:'2026-10-16',category:'Electricity',description:'Bill ₹1552 for Sept',amount:1552,mode:'UPI',paidBy:'Cafe UPI/bank'},
              {id:'e3',date:'2026-10-31',category:'Bank charges',description:'SMS charges',amount:59,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'}];
    purchases=[{id:'p1',date:'2026-10-18',vendor:'Roobi Devi Kirana',item:'Milk',qty:10,unit:'L',rate:60,gst:0,mode:'UPI',paidBy:'Cafe UPI/bank'}];
    cashMoves=[{id:'m1',date:'2026-10-20',holder:'Rishabh',type:'bank',amount:2500,note:'SBI slip 123'},{id:'m2',type:'interest',date:'2026-10-31',amount:125.5},
               {id:'m3',type:'atm',date:'2026-10-22',amount:2000,note:'ATM'},{id:'m4',type:'bankadj',date:'2026-10-25',amount:-100,note:'Statement correction'}];
    saveEverything(); renderAll(); showView('records'); switchRecordsSub('bank'); bkMonth='2026-10'; renderBankView();`);
  const closing = await E(p, `bankMonthData('2026-10').closing`);
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null);
  await p.click('#bk_pdf'); const d = await dl;
  assert(!!d, 'statement PDF downloads');
  if (d) { console.log('   file:', d.suggestedFilename()); await d.saveAs(process.env.S + '/stmt.pdf'); }
  assert(d && /Bank_Statement_2026-10\.pdf$/.test(d.suggestedFilename()), 'named by outlet and month');
  console.log('   closing', closing);
  assert(await p.textContent('#bk_pdf') !== 'Creating…', 'button resets');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
