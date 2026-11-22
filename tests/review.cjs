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
    settings.openingCash=1000; settings.openingCashDate='2026-09-01'; settings.bankBalance=40000; settings.bankDate='2026-09-01'; saveSettings();
    sales=[]; for(var d=1; d<=30; d++){ var ds='2026-10-'+String(d).padStart(2,'0'); sales.push({id:'c'+d,date:ds,customer:'W',amount:1500,mode:'Cash'},{id:'u'+d,date:ds,customer:'W',amount:2000,mode:'UPI'}); }
    sales.push({id:'sep',date:'2026-09-15',customer:'W',amount:3000,mode:'Cash'},{id:'cr',date:'2026-10-05',customer:'Amit',customerId:'c1',amount:600,mode:'Credit'});
    sales.push({id:'n1',date:'2026-11-01',customer:'W',amount:800,mode:'Cash'});
    customers=[{id:'c1',name:'Amit'}];
    creditPayments=[{id:'cp1',customerId:'c1',date:'2026-10-12',amount:300,mode:'Cash'},{id:'cp2',customerId:'c1',date:'2026-10-13',amount:300,mode:'UPI'}];
    investments=[{id:'i1',date:'2026-10-02',partner:'Rishabh',invType:'Investment',amount:10000,mode:'Bank Transfer'}];
    cashDays=[]; for(var d=1; d<=30; d++){ var ds='2026-10-'+String(d).padStart(2,'0'); if(d%7===0) cashDays.push({id:'k'+d,date:ds,counted:null}); }
    purchases=[{id:'p1',date:'2026-10-03',vendor:'V',item:'Milk',qty:10,unit:'L',rate:60,gst:0,mode:'Cash',paidBy:'Cafe cash'},
               {id:'p2',date:'2026-10-04',vendor:'V',item:'Tea',qty:2,unit:'kg',rate:400,gst:0,mode:'UPI',paidBy:'Cafe UPI/bank'},
               {id:'p3',date:'2026-10-06',vendor:'V',item:'Cups',qty:100,unit:'pcs',rate:2,gst:0,mode:'Cash',paidBy:'Dashrath Bhaiya (personal)'}];
    expenses=[{id:'e1',date:'2026-10-05',category:'Rent',description:'Rent - October 2026',amount:30000,mode:'Bank Transfer',paidBy:'Cafe UPI/bank'},
              {id:'e2',date:'2026-10-07',category:'Repairs',amount:250,mode:'Cash',paidBy:'Cafe cash'},
              {id:'e3',date:'2026-10-16',category:'Electricity',amount:900,mode:'Cash',paidBy:'Rishabh (cafe cash held)'},
              {id:'e4',date:'2026-10-20',category:'Wifi / Internet',amount:500,mode:'UPI',paidBy:'Rishabh (personal)',settled:true,settleMode:'bank',settledOn:'2026-10-25'}];
    cashMoves=[{id:'m1',date:'2026-10-18',holder:'Rishabh',type:'bank',amount:15000},{id:'m2',type:'interest',date:'2026-10-31',amount:80},
               {id:'m3',type:'atm',date:'2026-10-22',amount:1000},{id:'m4',type:'bankadj',date:'2026-10-28',amount:-50,note:'fee'},
               {id:'m5',date:'2026-10-23',holder:'Rishabh',type:'withdraw',amount:2000}];
    saveEverything();`);
  // daily counts: count on the 10th and 20th, slightly short on the 20th, hand over to Rishabh
  await E(p, `var e10 = expectedCash('2026-10-10'); cashDays.push({id:'d10',date:'2026-10-10',counted:e10,floatLeft:500,receivedBy:'Rishabh',incharge:'Rohit'});
              var e20 = expectedCash('2026-10-20'); cashDays.push({id:'d20',date:'2026-10-20',counted:e20-120,floatLeft:500,receivedBy:'Rishabh',incharge:'Rohit'});
              saveCashDays(); renderAll();`);
  for (const mk of ['2026-09','2026-10','2026-11']) {
    const R = JSON.parse(await E(p, `JSON.stringify(cashReview('${mk}'))`));
    console.log('   ' + mk + ': start ' + R.start + ' end ' + R.end + ' change ' + R.change + ' | lines ' + R.extTotal + ' ' + JSON.stringify(R.ext));
    assert(Math.abs(R.extTotal - R.change) < 0.01, mk + ': what-changed lines add up to the change');
  }
  const O = JSON.parse(await E(p, `JSON.stringify(cashReview('2026-10'))`));
  assert(O.ext.cashSales === 45000 && O.ext.upiSales === 60000, 'Oct cash sales 45,000, UPI 60,000');
  assert(O.ext.udhaar === 600 && !O.ext.pCapital && O.directIn === 10000 && O.ext.interest === 80, 'udhaar 600, old capital entry counted as paid directly, interest 80');
  assert(O.ext.purchases === -1400 && O.ext.expenses === -31150 && O.ext.repaid === -500 && O.ext.pWithdraw === -2000, 'purchases 600+800 (partner-paid cups excluded), expenses 30,000+250+900, repaid 500, withdrawal 2,000');
  assert(O.ext.countDiff === -120 && O.countDays.length === 1 && O.countDays[0].diff === -120, 'counter short ₹120 on 20 Oct');
  assert(O.ext.bankAdj === -50, 'bank adjustment');
  const S9 = JSON.parse(await E(p, `JSON.stringify(cashReview('2026-09'))`));
  assert(S9.end === O.start, 'September end = October start');
  const N = JSON.parse(await E(p, `JSON.stringify(cashReview('2026-11'))`));
  assert(N.start === O.end, 'October end = November start');
  // UI + PDF
  await E(p, `showView('records'); switchRecordsSub('review'); crMonth='2026-10'; renderCashReviewView();`);
  const t = (await p.textContent('#reviewView')).replace(/\s+/g,' ');
  assert(/Where the cafe’s money is/.test(t) && /With Rishabh/.test(t) && /Bank \/ UPI account/.test(t) && /Counter short \/ over at counts ?₹120/.test(t), 'tab shows places and lines');
  assert(/Moved between places/.test(t), 'transfers listed separately');
  await p.screenshot({ path: process.env.S + '/review.png', fullPage: true });
  const dl = p.waitForEvent('download', { timeout: 10000 }).catch(()=>null);
  await p.click('#cr_pdf'); const d = await dl;
  assert(!!d && /Cash_Review_2026-10\.pdf$/.test(d.suggestedFilename()), 'PDF downloads');
  if (d) await d.saveAs(process.env.S + '/review.pdf');
  await E(p, `switchRecordsSub('cash')`); await p.click('#cash_cr'); await p.waitForTimeout(200);
  assert(await E(p, 'recSub') === 'review', 'Cash tab button opens the review');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
