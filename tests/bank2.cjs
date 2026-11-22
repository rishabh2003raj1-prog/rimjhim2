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
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; savePartners();
    settings.bankBalance=50000; settings.bankDate='2026-10-10'; saveSettings();
    sales=[{id:'s0',date:'2026-10-09',customer:'W',amount:9999,mode:'UPI'},
           {id:'s1',date:'2026-10-11',customer:'W',amount:3000,mode:'UPI'},
           {id:'s2',date:'2026-10-11',customer:'W',amount:1000,gst:5,mode:'Card'},
           {id:'s3',date:'2026-10-11',customer:'W',amount:2000,mode:'Cash'},
           {id:'s4',date:'2026-10-11',customer:'W',amount:700,mode:'Credit'}];
    creditPayments=[{id:'cp1',customerId:'c',date:'2026-10-12',amount:400,mode:'UPI'},{id:'cp2',customerId:'c',date:'2026-10-12',amount:300,mode:'Cash'}];
    investments=[{id:'i1',date:'2026-10-13',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:20000,mode:'Bank Transfer',via:'bank'},
                 {id:'i2',date:'2026-10-13',partner:'Rishabh',invType:'Loan',purpose:'Working capital',amount:5000,mode:'Cash',via:'counter'},
                 {id:'i3',date:'2026-10-14',partner:'Dashrath Bhaiya',invType:'Withdrawal',amount:3000,mode:'UPI'}];
    cashMoves=[{id:'m1',date:'2026-10-15',holder:'Rishabh',type:'bank',amount:2500}];
    expenses=[{id:'e1',date:'2026-10-16',category:'Rent',description:'Rent - October 2026',amount:30000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'},
              {id:'e2',date:'2026-10-16',category:'Electricity',amount:1500,mode:'UPI',paidBy:'Rishabh (personal)'},
              {id:'e3',date:'2026-10-16',category:'Repairs',amount:200,mode:'Cash',paidBy:'Cafe cash'},
              {id:'e4',date:'2026-10-16',category:'Repairs',amount:600,mode:'Cash',paidBy:'Rishabh (cafe cash held)'},
              {id:'e5',date:'2026-10-17',category:'Wifi / Internet',amount:500,mode:'UPI'}];
    purchases=[{id:'p1',date:'2026-10-18',vendor:'V',item:'Milk',qty:10,unit:'L',rate:60,gst:0,mode:'UPI',paidBy:'Cafe UPI/bank'},
               {id:'p2',date:'2026-10-18',vendor:'V',item:'Sugar',qty:5,unit:'kg',rate:50,gst:0,mode:'Credit',paidBy:'Cafe UPI/bank'},
               {id:'p3',date:'2026-10-18',vendor:'V',item:'Tea',qty:1,unit:'kg',rate:400,gst:0,mode:'Cash',paidBy:'Cafe cash'},
               {id:'p4',date:'2026-10-18',vendor:'V',item:'Cups',qty:100,unit:'pcs',rate:2,gst:0,mode:'UPI',paidBy:'Dashrath Bhaiya (personal)'}];
    saveSales(); saveCreditPayments(); saveInvest(); saveCashMoves(); saveExpense(); savePurch(); renderAll();`);
  const m = JSON.parse(await E(p, `JSON.stringify(bankMovements())`));
  console.log('   ' + JSON.stringify(m));
  assert(m.sales === 4050, 'UPI 3,000 + card 1,050 (with GST); cash, udhaar and pre-noted sales ignored');
  assert(m.udhaar === 400 && m.loanin === 20000 && m.withdraw === 3000 && m.deposits === 2500, 'udhaar by UPI, bank investment, UPI withdrawal, deposit');
  assert(m.bills === 30500, 'rent by bank + wifi by UPI; partner-own, till and handover-cash bills ignored');
  assert(m.purchases === 600, 'milk by UPI only; credit, cash and partner-own purchases ignored');
  const now = await E(p, `bankBalanceNow()`);
  assert(now === 50000 + 4050 + 400 + 20000 + 2500 - 30500 - 600 - 3000, 'bank now = 42,850 (' + now + ')');
  await E(p, `showView('records'); switchRecordsSub('cash');`);
  const c = (await p.textContent('#cashView')).replace(/\s+/g,' ');
  console.log('   ' + c.slice(c.indexOf('Cafe bank account'), c.indexOf('Cafe bank account') + 420));
  assert(/Cafe bank account now ?₹42,850/.test(c), 'Cash tab shows the breakdown and bank now');
  await p.click('nav.tabs button[data-v="dashboard"]'); await p.waitForTimeout(200);
  assert(/₹42,850/.test(await p.textContent('#moneyPos')), 'dashboard shows bank now');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
